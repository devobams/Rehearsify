// Business logic and public API for repertoire.
import * as repertoireModel from "./repertoire.model.js";
import cloudinary from "../../shared/cloudinary.js";

export async function createSong(data) {
  // Business Rule: Prevent duplicate songs by title + composer
  const existing = await repertoireModel.findSongByTitleAndComposer(
    data.title,
    data.composer,
  );
  if (existing) {
    const err = new Error("A song with this title and composer already exists");
    err.statusCode = 400;
    throw err;
  }

  return repertoireModel.createSong(data);
}

export async function listSongs(filters) {
  return repertoireModel.findSongs(filters);
}

export async function getSongById(id) {
  const song = await repertoireModel.findSongById(id);
  if (!song) {
    const err = new Error("Song not found");
    err.statusCode = 404;
    throw err;
  }
  return song;
}

export async function updateSong(id, data) {
  const currentSong = await getSongById(id); // Throws 404 if missing

  // Determine what the target title & composer will be after update
  const newTitle = data.title ?? currentSong.title;
  const newComposer = data.composer ?? currentSong.composer;

  // If title or composer is changing, verify no other song already uses this combination
  if (data.title || data.composer) {
    const existing = await repertoireModel.findSongByTitleAndComposer(
      newTitle,
      newComposer,
    );

    // Check if a match exists AND it's not the same song we are currently updating
    if (existing && existing.id !== id) {
      const err = new Error(
        "A song with this title and composer already exists",
      );
      err.statusCode = 400;
      throw err;
    }
  }

  return repertoireModel.updateSong(id, data);
}

export async function softDeleteSong(id) {
  await getSongById(id); // Throws 404 if missing
  return repertoireModel.softDeleteSong(id);
}

export async function uploadSheet(id, fileBuffer) {
  // first confirm the song exists
  const song = await getSongById(id);

  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto', folder: 'rehearsify/song-sheets' },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(fileBuffer);
    });
  } catch (err) {
    const uploadErr = new Error(`Failed to upload sheet for song ${id}: ${err.message}`);
    uploadErr.statusCode = 502;
    throw uploadErr;
  }

  // if replacing an existing sheet, clean up the old Cloudinary asset
  if (song.sheetPublicId) {
    try {
      await cloudinary.uploader.destroy(song.sheetPublicId, {
        resource_type: song.sheetResourceType,
      });
    } catch (err) {
      console.warn(`Failed to destroy old Cloudinary asset ${song.sheetPublicId} for song ${id}:`, err.message);
      // Non-fatal — proceed with DB update so the replace still succeeds for the user
    }
  }

  return repertoireModel.updateSong(id, {
    sheetUrl: result.secure_url,
    sheetPublicId: result.public_id,
    sheetResourceType: result.resource_type,
  });
}

export async function deleteSheet(id) {
  const song = await getSongById(id);

  if (!song.sheetPublicId) {
    const err = new Error('Song does not have a sheet to delete');
    err.statusCode = 404;
    throw err;
  }

  try {
    await cloudinary.uploader.destroy(song.sheetPublicId, {
      resource_type: song.sheetResourceType,
    });
  } catch (err) {
    console.warn(`Failed to destroy Cloudinary asset ${song.sheetPublicId} for song ${id}:`, err.message);
  }

  return repertoireModel.updateSong(id, {
    sheetUrl: null,
    sheetPublicId: null,
    sheetResourceType: null,
  });
}
export async function getAllActiveSongs() {
  return repertoireModel.findSongs({ active: true });
}
