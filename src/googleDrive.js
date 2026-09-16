// Talks to the Google Apps Script web app that stores Shared Album photos
// in Google Drive. See google-apps-script/Code.gs for the backend code and
// setup steps.

const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;

// Turns a File into the base64 text the Apps Script backend expects.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Google's servers occasionally send back a broken, empty reply instead of
// the real one when a lot of requests arrive close together (for example
// several guests using the album at the same time). Trying again after a
// short pause almost always works, so this only gives up after a few tries.
const MAX_ATTEMPTS = 3;

async function callScript(payload, attempt = 1) {
  if (!SCRIPT_URL) {
    throw new Error('Google Drive is not set up yet. Add VITE_GOOGLE_SCRIPT_URL to your .env file.');
  }
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      // Plain text avoids a CORS preflight request, which Apps Script web apps don't support.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Google Drive request failed.');
    }
    return result;
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
      return callScript(payload, attempt + 1);
    }
    throw err;
  }
}

// Turns a guest's full name into safe text for a file name (letters,
// numbers, spaces, dashes and underscores only).
function toSafeFileName(name) {
  const cleaned = (name || '').trim().replace(/[^a-zA-Z0-9 _-]/g, '');
  return cleaned || 'Guest';
}

// Uploads a photo file to Drive and returns { imageUrl, fileId }.
// uploaderName becomes the Drive file name, so it's easy to tell whose
// photo is which straight from the Drive folder.
export async function uploadPhotoToDrive(file, uploaderName) {
  const base64Data = await fileToBase64(file);
  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const fileName = `${toSafeFileName(uploaderName)}-${Date.now()}${extension}`;
  try {
    const result = await callScript({
      action: 'upload',
      fileName,
      mimeType: file.type,
      base64Data,
    });
    return { imageUrl: result.url, fileId: result.fileId };
  } catch (err) {
    // Every attempt above still got a broken reply, but the photo may have
    // actually made it into Drive anyway (the same broken-reply problem
    // callScript already retries around). Before giving up and losing the
    // record for a photo that's really there, look for a file with the
    // exact name just uploaded and use that instead.
    try {
      const files = await listPhotosFromDrive();
      const match = files.find((f) => f.name === fileName);
      if (match) {
        return { imageUrl: match.url, fileId: match.fileId };
      }
    } catch (lookupErr) {
      // Ignore; fall through to throwing the original error below.
    }
    throw err;
  }
}

// Deletes a photo from Drive by its file ID.
export async function deletePhotoFromDrive(fileId) {
  if (!fileId) return;
  await callScript({ action: 'delete', fileId });
}

// Lists every photo currently in the Drive folder, including ones added
// straight to Drive instead of through this app's upload buttons.
export async function listPhotosFromDrive() {
  const result = await callScript({ action: 'list' });
  return result.files || [];
}
