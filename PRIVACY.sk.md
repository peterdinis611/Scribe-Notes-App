# Zásady ochrany súkromia — Scribe

**Účinné od 20. septembra 2026 · Scribe 2.3.0**

Scribe je lokálny editor dokumentov pre macOS. Tento text popisuje, čo aplikácia ukladá na Macu, čo neodosiela vývojárovi a kedy funkcia, ktorú zapneš, môže hovoriť s iným zariadením.

Prevádzkovateľ tohto softvéru je **Peter Dinis**. Scribe neprevádzkuje cloudové kontá a z aplikácie nezbiera analytiku.

## 1. Najprv lokálne

Dokumenty, knižnica SQLite, nastavenia, revízie a voliteľné zálohy `.scribe` ostávajú na používateľskom účte macOS, ktorý Scribe spúšťa. Neexistuje prihlásenie do Scribe ani Scribe cloud.

## 2. Čo ostáva na tomto Macu

Podľa toho, ako aplikáciu používaš, môže Scribe na disku uložiť:

- obsah dokumentov, názvy, priečinky, tagy, komentáre a históriu verzií
- nastavenia rozhrania, témy, skratky a jazykové balíčky
- voliteľné indexy Lokálnej AI vytvorené na tomto Macu
- históriu schránky vo vnútri aplikácie
- revízie sync konfliktov, keď sa zmení súbor na disku aj kópia v aplikácii

Stále platia oprávnenia súborov macOS. Scribe zapisuje do knižnice, ktorú zvolíš (predvolene `~/Documents/Scribe`), a do dát aplikácie — neprehľadáva celý disk.

## 3. Čo nezbierame

Aplikácia si u nás nevytvára účet. Neodosiela poznámky, analytiku používania, reklamné identifikátory ani telemetriu pádov vývojárovi.

## 4. Voliteľná sieť, ktorú spustíš ty

Niektoré funkcie kontaktujú iné servery len vtedy, keď ich použiješ:

- **Google Fonts** — výber písma z Google načíta metadáta a CSS z Google. Google môže vidieť bežnú webovú požiadavku (IP adresa, user agent).
- **Vzdialené obrázky a vloženia** — URL alebo YouTube vložené tebou sa sťahuje z daného hostiteľa.
- **Kontrola aktualizácií** — Diagnostika môže v prehliadači otvoriť stránku GitHub Releases. Tú návštevu potom vidí GitHub.

Scribe sa v pravidelných intervaloch nehlási vývojárovi, aby hlásil, ako píšeš.

## 5. MCP (Cursor / Claude)

Most MCP je voliteľný a beží ako lokálny stdio proces na tomto Macu. Sám poznámky neodosiela. Ak Cursor, Claude alebo iný hostiteľ číta Scribe cez nástroje, **platí politika toho hostiteľa** pre obsah, ktorý model stiahne.

## 6. Mobilný zápis

Mobilný zápis je lokálny Wi‑Fi poslucháč na Macu. Telefón sa rozpráva s tým Macom v LAN. Scribe neposiela zápisy cez server vývojára.

## 7. Tvoja kontrola

Môžeš zmeniť priečinok dokumentov, exportovať alebo zmazať knižnicu, vypnúť voliteľné funkcie a odinštalovať aplikáciu. Zmazanie dát aplikácie a priečinka dokumentov odstráni lokálnu knižnicu z toho Macu.

## 8. Deti

Scribe je všeobecný nástroj na písanie. Nie je určený deťom do 13 rokov a vedome od detí nezbierame osobné údaje.

## 9. Zmeny

Keď sa táto politika zmení, aktualizuje sa oznámenie v aplikácii aj tento súbor s verziou aplikácie. Ďalšie používanie po aktualizácii znamená, že platí aktuálne znenie.

## 10. Kontakt

Otázky k tejto politike: issue v repozitári [Scribe-Notes-App](https://github.com/peterdinis611/Scribe-Notes-App).

---

English version: [PRIVACY.md](PRIVACY.md)
