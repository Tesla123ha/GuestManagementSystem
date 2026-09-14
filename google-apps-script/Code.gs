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

const FOLDER_ID = 'https://drive.google.com/drive/u/6/folders/1cWPIdUXNbu7jMebpo5c9skJvEFDgGQY_';

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);

    if (request.action === 'upload') {
      return handleUpload(request);
    }
    if (request.action === 'delete') {
      return handleDelete(request);
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
    url: 'https://drive.google.com/uc?export=view&id=' + file.getId(),
  });
}

function handleDelete(request) {
  const file = DriveApp.getFileById(request.fileId);
  file.setTrashed(true);
  return jsonResponse({ success: true });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
