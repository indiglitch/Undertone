import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Playlist } from './types';

export async function exportPlaylist(playlist: Playlist, notice: (text: string) => void) {
  const path = await open({title: 'Куда скопировать папку плейлиста?', directory: true, multiple: false});
  if (!path || Array.isArray(path)) return;
  notice('Копирование треков плейлиста…');
  const folder = await invoke<string>('export_playlist', {playlistId: playlist.id, path});
  notice(`Плейлист скопирован: ${folder}`);
}
