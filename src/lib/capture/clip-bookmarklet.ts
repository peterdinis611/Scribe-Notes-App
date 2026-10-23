/**
 * Safari / browser share-style clipper via `scribe://clip` deep link.
 * Drag this onto the bookmarks bar, or paste into a bookmark URL field.
 */
export function buildClipBookmarklet(): string {
  const js = `(function(){
  var u=location.href;
  var t=document.title||'';
  var s='';
  try{
    s=window.getSelection&&String(window.getSelection())||'';
    if(!s){
      var m=document.querySelector('meta[name="description"]');
      if(m&&m.content)s=m.content;
    }
  }catch(e){}
  var q='url='+encodeURIComponent(u)
    +'&title='+encodeURIComponent(t.slice(0,200))
    +'&text='+encodeURIComponent(s.slice(0,4000));
  location.href='scribe://clip?'+q;
})();`
  return `javascript:${encodeURIComponent(js)}`
}

export async function copyClipBookmarklet(): Promise<string> {
  const code = buildClipBookmarklet()
  await navigator.clipboard.writeText(code)
  return code
}
