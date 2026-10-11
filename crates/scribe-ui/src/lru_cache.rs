//! Generic LRU map with optional retain pins and byte-budget eviction
//! (`src/lib/cache/lru-cache.ts`).

use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::Hash;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LruEvictReason {
    Count,
    Bytes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct LruCacheStats {
    pub size: usize,
    pub bytes: u64,
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
    pub puts: u64,
}

pub struct LruCacheOptions<V> {
    pub max_entries: usize,
    pub target_entries: Option<usize>,
    pub max_bytes: Option<u64>,
    pub target_bytes: Option<u64>,
    pub sizeof: Box<dyn Fn(&V) -> u64 + Send + Sync>,
}

impl<V> LruCacheOptions<V> {
    pub fn new(max_entries: usize) -> Self {
        Self {
            max_entries: max_entries.max(1),
            target_entries: None,
            max_bytes: None,
            target_bytes: None,
            sizeof: Box::new(|_| 0),
        }
    }

    pub fn with_sizeof<F>(mut self, f: F) -> Self
    where
        F: Fn(&V) -> u64 + Send + Sync + 'static,
    {
        self.sizeof = Box::new(f);
        self
    }
}

/// Insertion order = LRU (oldest first). Touch moves to newest.
pub struct LruCache<K, V> {
    store: HashMap<K, V>,
    order: VecDeque<K>,
    retained: HashSet<K>,
    max_entries: usize,
    target_entries: usize,
    max_bytes: u64,
    target_bytes: u64,
    sizeof: Box<dyn Fn(&V) -> u64 + Send + Sync>,
    bytes: u64,
    hits: u64,
    misses: u64,
    evictions: u64,
    puts: u64,
}

impl<K, V> LruCache<K, V>
where
    K: Eq + Hash + Clone,
{
    pub fn new(options: LruCacheOptions<V>) -> Self {
        let max_entries = options.max_entries.max(1);
        let target_entries = options
            .target_entries
            .unwrap_or(max_entries)
            .clamp(1, max_entries);
        let max_bytes = options.max_bytes.unwrap_or(u64::MAX);
        let target_bytes = options
            .target_bytes
            .unwrap_or(max_bytes)
            .min(max_bytes);
        Self {
            store: HashMap::new(),
            order: VecDeque::new(),
            retained: HashSet::new(),
            max_entries,
            target_entries,
            max_bytes,
            target_bytes,
            sizeof: options.sizeof,
            bytes: 0,
            hits: 0,
            misses: 0,
            evictions: 0,
            puts: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.store.len()
    }

    pub fn is_empty(&self) -> bool {
        self.store.is_empty()
    }

    pub fn byte_size(&self) -> u64 {
        self.bytes
    }

    pub fn has(&self, key: &K) -> bool {
        self.store.contains_key(key)
    }

    pub fn peek(&mut self, key: &K) -> Option<&V> {
        match self.store.get(key) {
            Some(value) => {
                self.hits += 1;
                Some(value)
            }
            None => {
                self.misses += 1;
                None
            }
        }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        if !self.store.contains_key(key) {
            self.misses += 1;
            return None;
        }
        self.hits += 1;
        self.touch(key);
        self.store.get(key)
    }

    pub fn set(&mut self, key: K, value: V) {
        if let Some(previous) = self.store.remove(&key) {
            self.bytes = self.bytes.saturating_sub((self.sizeof)(&previous));
            self.order.retain(|k| k != &key);
        }
        self.bytes = self.bytes.saturating_add((self.sizeof)(&value));
        self.store.insert(key.clone(), value);
        self.order.push_back(key);
        self.puts += 1;
        self.evict_if_needed();
    }

    pub fn delete(&mut self, key: &K) -> bool {
        match self.store.remove(key) {
            Some(previous) => {
                self.bytes = self.bytes.saturating_sub((self.sizeof)(&previous));
                self.order.retain(|k| k != key);
                true
            }
            None => false,
        }
    }

    pub fn clear(&mut self) {
        self.store.clear();
        self.order.clear();
        self.retained.clear();
        self.bytes = 0;
    }

    pub fn touch(&mut self, key: &K) -> bool {
        if !self.store.contains_key(key) {
            return false;
        }
        self.order.retain(|k| k != key);
        self.order.push_back(key.clone());
        true
    }

    pub fn set_retained<I>(&mut self, ids: I)
    where
        I: IntoIterator<Item = K>,
    {
        self.retained.clear();
        for id in ids {
            self.retained.insert(id);
        }
        let retained: Vec<K> = self.retained.iter().cloned().collect();
        for id in retained {
            self.touch(&id);
        }
        self.evict_if_needed();
    }

    pub fn is_retained(&self, key: &K) -> bool {
        self.retained.contains(key)
    }

    pub fn stats(&self) -> LruCacheStats {
        LruCacheStats {
            size: self.store.len(),
            bytes: self.bytes,
            hits: self.hits,
            misses: self.misses,
            evictions: self.evictions,
            puts: self.puts,
        }
    }

    pub fn reset_stats(&mut self) {
        self.hits = 0;
        self.misses = 0;
        self.evictions = 0;
        self.puts = 0;
    }

    fn evict_if_needed(&mut self) {
        let over_count = self.store.len() >= self.max_entries;
        let over_bytes = self.bytes > self.max_bytes;
        if !over_count && !over_bytes {
            return;
        }

        let count_floor = if over_count {
            self.target_entries
        } else {
            self.store.len()
        };
        let bytes_floor = if over_bytes {
            self.target_bytes
        } else {
            self.max_bytes
        };

        // Pass 1: classic LRU — drop oldest non-retained.
        let keys: Vec<K> = self.order.iter().cloned().collect();
        for key in keys {
            if self.store.len() <= count_floor && self.bytes <= bytes_floor {
                return;
            }
            if self.retained.contains(&key) {
                continue;
            }
            if self.delete(&key) {
                self.evictions += 1;
            }
        }

        // Pass 2: still over byte budget — drop largest non-retained.
        if self.bytes <= bytes_floor {
            return;
        }
        let mut candidates: Vec<(K, u64)> = self
            .store
            .iter()
            .filter(|(key, _)| !self.retained.contains(*key))
            .map(|(key, value)| (key.clone(), (self.sizeof)(value)))
            .collect();
        candidates.sort_by(|a, b| b.1.cmp(&a.1));
        for (key, _) in candidates {
            if self.bytes <= bytes_floor {
                break;
            }
            if self.delete(&key) {
                self.evictions += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evicts_oldest_non_retained() {
        let mut cache = LruCache::new(LruCacheOptions::new(2));
        cache.set("a".to_string(), 1);
        cache.set("b".to_string(), 2);
        cache.set("c".to_string(), 3);
        assert!(!cache.has(&"a".to_string()));
        assert!(cache.has(&"b".to_string()));
        assert!(cache.has(&"c".to_string()));
        assert_eq!(cache.stats().evictions, 1);
    }

    #[test]
    fn retains_pinned_keys() {
        let mut cache = LruCache::new(LruCacheOptions::new(2));
        cache.set("a".to_string(), 1);
        cache.set("b".to_string(), 2);
        cache.set_retained(["a".to_string()]);
        cache.set("c".to_string(), 3);
        assert!(cache.has(&"a".to_string()));
        assert!(!cache.has(&"b".to_string()));
    }
}
