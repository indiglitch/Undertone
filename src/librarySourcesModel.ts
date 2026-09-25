import type { Library } from './types';

export const displayFolderPath=(path:string)=>path.replace(/^\\\\\?\\/,'');

export function addLibraryFoldersSnapshot(library:Library,folders:string[]):Library{
  const existing=new Set(library.folders.map(folder=>displayFolderPath(folder).toLocaleLowerCase()));
  const added=folders.filter(folder=>{const key=displayFolderPath(folder).toLocaleLowerCase();if(existing.has(key))return false;existing.add(key);return true;});
  return added.length?{...library,folders:[...library.folders,...added]}:library;
}

export function removeLibraryFolderSnapshot(library:Library,folder:string):Library{
  return {...library,folders:library.folders.filter(source=>source!==folder)};
}
