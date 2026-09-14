import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCG1nMehPCSP2wsJLy0B7-chqcJFM1256Y",
  authDomain: "guestmanagementsystem-cd385.firebaseapp.com",
  projectId: "guestmanagementsystem-cd385",
  storageBucket: "guestmanagementsystem-cd385.firebasestorage.app",
  messagingSenderId: "401954330224",
  appId: "1:401954330224:web:7e3aca82a501a9c69786b5"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
