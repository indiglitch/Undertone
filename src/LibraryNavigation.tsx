import type {NavigationPage} from './navigationModel';
const sections=[['library','Треки'],['albums','Альбомы'],['artists','Исполнители'],['playlists','Плейлисты'],['liked','Любимые'],['recentlyAdded','Новые']] as const;
export default function LibraryNavigation({page,navigate}:{page:NavigationPage;navigate:(page:NavigationPage)=>void}){
  if(!sections.some(([kind])=>kind===page.kind))return null;
  return <nav className="collection-tabs" aria-label="Разделы медиатеки">{sections.map(([kind,label])=><button key={kind} data-library-id={kind} aria-current={page.kind===kind?'page':undefined} onClick={()=>navigate({kind})}>{label}</button>)}</nav>;
}
