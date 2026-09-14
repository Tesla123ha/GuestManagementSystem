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

async function callScript(payload) {
  if (!SCRIPT_URL) {
    throw new Error('Google Drive is not set up yet. Add VITE_GOOGLE_SCRIPT_URL to your .env file.');
  }
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
  const result = await callScript({
    action: 'upload',
    fileName,
    mimeType: file.type,
    base64Data,
  });
  return { imageUrl: result.url, fileId: result.fileId };
}

// Deletes a photo from Drive by its file ID.
export async function deletePhotoFromDrive(fileId) {
  if (!fileId) return;
  await callScript({ action: 'delete', fileId });
}
