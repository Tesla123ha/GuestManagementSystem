// Google Apps Script Web App for the Shared Album.
//
// Setup:
// 1. Go to https://script.google.com and create a new project.
// 2. Delete the sample code and paste in this whole file.
// 3. Create a folder in Google Drive for the party photos, open it, and
//    copy the folder ID from the URL (the part after /folders/).
// 4. Paste that ID into FOLDER_ID below.
// 5. Click Deploy > New deployment > type: Web app.
//    - Execute as: Me
//    - Who has access: Anyone
// 6. Copy the Web app URL you get after deploying.
// 7. Put that URL in your .env file as VITE_GOOGLE_SCRIPT_URL (see .env.example).

const FOLDER_ID = '1cWPIdUXNbu7jMebpo5c9skJvEFDgGQY_';

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);

    if (request.action === 'upload') {
      return handleUpload(request);
    }
    if (request.action === 'delete') {
      return handleDelete(request);
    }
    if (request.action === 'list') {
      return handleList();
    }
    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function handleUpload(request) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const bytes = Utilities.base64Decode(request.base64Data);
  const blob = Utilities.newBlob(bytes, request.mimeType, request.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return jsonResponse({
    success: true,
    fileId: file.getId(),
    url: viewUrlFor(file.getId()),
  });
}

// Builds a link that actually shows the picture itself when placed in an
// <img> tag, instead of a Drive preview page.
function viewUrlFor(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
}

function handleDelete(request) {
  const file = DriveApp.getFileById(request.fileId);
  file.setTrashed(true);
  return jsonResponse({ success: true });
}

// Lists every photo currently sitting in the Drive folder, including ones
// added straight to Drive instead of through the app.
function handleList() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();
  const results = [];
  while (files.hasNext()) {
    const file = files.next();
    // A photo dropped into the folder by hand might still be private, so
    // make sure it's actually viewable by anyone with the link too. Some
    // files (like ones added from a different Google account) won't let
    // this script change their sharing, so skip just that step for those
    // instead of losing the whole list over one file.
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {
      // Move on and still list the file, using whatever access it already has.
    }
    results.push({
      fileId: file.getId(),
      name: file.getName(),
      url: viewUrlFor(file.getId()),
    });
  }
  return jsonResponse({ success: true, files: results });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
