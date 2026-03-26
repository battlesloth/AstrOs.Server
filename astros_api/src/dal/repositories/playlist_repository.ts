import { Kysely } from 'kysely';
import { Database } from '../types.js';
import { Playlist, PlaylistSettings } from '../../models/playlists/playlist.js';
import { logger } from '../../logger.js';
import { TrackType } from '../../models/playlists/trackType.js';
import { v4 as uuid } from 'uuid';
import { PlaylistType } from '../../models/playlists/playlistType.js';
import { generateShortId } from '../../utility.js';

export class PlaylistRepository {
  constructor(private db: Kysely<Database>) {}

  async upsertPlaylist(playlist: Playlist): Promise<boolean> {
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('playlists')
        .values({
          id: playlist.id,
          playlist_name: playlist.playlistName,
          description: playlist.description,
          playlist_type: playlist.playlistType,
          last_modified: Date.now(),
          enabled: 1,
          settings: JSON.stringify(playlist.settings),
        })
        .onConflict((c) =>
          c.column('id').doUpdateSet((eb) => ({
            playlist_name: eb.ref('excluded.playlist_name'),
            description: eb.ref('excluded.description'),
            last_modified: eb.ref('excluded.last_modified'),
            enabled: eb.ref('excluded.enabled'),
            playlist_type: eb.ref('excluded.playlist_type'),
            settings: eb.ref('excluded.settings'),
          })),
        )
        .execute()
        .catch((err: any) => {
          logger.error(`Exception saving playlist ${playlist.id}`, err);
          throw err;
        });

      await tx
        .deleteFrom('playlist_tracks')
        .where('playlist_id', '=', playlist.id)
        .execute()
        .catch((err: any) => {
          logger.error(`Exception deleting old tracks for playlist ${playlist.id}`, err);
          throw err;
        });

      for (const track of playlist.tracks) {
        await tx
          .insertInto('playlist_tracks')
          .values({
            id: track.id,
            playlist_id: playlist.id,
            idx: track.idx,
            duration_ds: track.durationDS,
            random_wait: track.randomWait ? 1 : 0,
            duration_max_ds: track.durationMaxDS,
            track_type: track.trackType,
            track_id: track.trackId,
            track_name: track.trackName,
          })
          .execute()
          .catch((err: any) => {
            logger.error(`Exception inserting track ${track.id} for playlist ${playlist.id}`, err);
            throw err;
          });
      }
    });

    return true;
  }

  async copyPlaylist(id: string): Promise<Playlist | null> {
    const playlist = await this.getPlaylist(id);

    if (!playlist) {
      logger.error(`Playlist with id ${id} not found for copy`);
      return null;
    }

    const newPlaylistId = generateShortId('p');
    const newPlaylist: Playlist = {
      ...playlist,
      id: newPlaylistId,
      playlistName: `${playlist.playlistName} (Copy)`,
    };

    for (let i = 0; i < newPlaylist.tracks.length; i++) {
      newPlaylist.tracks[i].id = uuid();
    }

    await this.upsertPlaylist(newPlaylist).catch((err: any) => {
      logger.error(`Exception copying playlist ${id} => ${err}`);
      throw err;
    });

    return newPlaylist;
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    const results = await this.db
      .selectFrom('playlists')
      .selectAll()
      .where('enabled', '=', 1)
      .execute()
      .catch((err: any) => {
        logger.error('Exception fetching playlists', err);
        throw err;
      });

    return results.map((result) => ({
      id: result.id,
      playlistName: result.playlist_name,
      description: result.description,
      playlistType: result.playlist_type as PlaylistType,
      settings: JSON.parse(result.settings) as PlaylistSettings,
      tracks: [], // Tracks are not included in this query
    }));
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    const result = await this.db
      .selectFrom('playlists')
      .selectAll()
      .where('id', '=', id)
      .where('enabled', '=', 1)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    const tracks = await this.db
      .selectFrom('playlist_tracks')
      .selectAll()
      .where('playlist_id', '=', id)
      .orderBy('idx', 'asc')
      .execute();

    return {
      id: result.id,
      playlistName: result.playlist_name,
      description: result.description,
      playlistType: result.playlist_type as PlaylistType,
      settings: JSON.parse(result.settings) as PlaylistSettings,
      tracks: tracks.map((track) => ({
        id: track.id,
        idx: track.idx,
        playlistId: track.playlist_id,
        durationDS: track.duration_ds,
        randomWait: track.random_wait === 1,
        durationMaxDS: track.duration_max_ds,
        trackType: track.track_type as TrackType,
        trackId: track.track_id,
        trackName: track.track_name,
      })),
    };
  }

  async deletePlaylist(id: string): Promise<boolean> {
    await this.db
      .updateTable('playlists')
      .set({ enabled: 0 })
      .where('id', '=', id)
      .execute()
      .catch((err: any) => {
        logger.error(`Exception deleting playlist ${id}`, err);
        throw err;
      });

    return true;
  }

  async getPlaylistNamesThatUseScript(scriptId: string): Promise<string[]> {
    return this.db
      .selectFrom('playlist_tracks')
      .innerJoin('playlists', 'playlists.id', 'playlist_tracks.playlist_id')
      .select('playlists.playlist_name')
      .where('playlist_tracks.track_type', '=', TrackType.Script)
      .where('playlist_tracks.track_id', '=', scriptId)
      .where('playlists.enabled', '=', 1)
      .execute()
      .then((results) => results.map((r) => r.playlist_name))
      .catch((err: any) => {
        logger.error(`Exception fetching playlists that use script ${scriptId}`, err);
        throw err;
      });
  }

  async deleteTracksByScriptId(scriptId: string): Promise<boolean> {
    await this.db
      .deleteFrom('playlist_tracks')
      .where('track_type', '=', TrackType.Script)
      .where('track_id', '=', scriptId)
      .execute()
      .catch((err: any) => {
        logger.error(`Exception deleting tracks with script ${scriptId}`, err);
        throw err;
      });

    return true;
  }
}
