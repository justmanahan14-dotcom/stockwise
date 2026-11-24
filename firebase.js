import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile
} from "firebase/auth";
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim()
};

const requiredConfig = ["apiKey", "authDomain", "projectId", "appId"];
const configuredValues = requiredConfig.filter((key) => config[key]);
export let firebaseConfigurationError = configuredValues.length > 0 && configuredValues.length < requiredConfig.length
  ? `Set all four Firebase values: ${requiredConfig.map((key) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`).join(", ")}.`
  : "";

export let auth = null;
export let db = null;

if (configuredValues.length === requiredConfig.length) {
  try {
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    firebaseConfigurationError = error.message || "Firebase configuration is invalid.";
  }
}

export const firebaseConfigured = Boolean(auth && db);
export {
  browserLocalPersistence,
  collection,
  createUserWithEmailAndPassword,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onAuthStateChanged,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  firebaseSignOut,
  updateProfile,
  updateDoc,
  where,
  writeBatch
};
