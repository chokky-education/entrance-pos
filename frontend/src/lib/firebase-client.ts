import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

export interface FirebaseWebClientConfig {
  projectId: string;
  apiKey: string;
  authDomain?: string;
  storageBucket?: string;
  appId?: string;
  databaseId?: string;
}

export function getFirebaseWebClient(cfg?: Partial<FirebaseWebClientConfig>): {
  app: FirebaseApp;
  db: Firestore;
  storage: FirebaseStorage;
} | null {
  const projectId =
    cfg?.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "entrace-pos";
  const apiKey =
    cfg?.apiKey ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyDCDQ4ECpC2Rky--cMGsGR6qLHHcNImYng";
  if (!projectId || !apiKey) return null;

  const storageBucket =
    cfg?.storageBucket ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.firebasestorage.app`;
  const authDomain =
    cfg?.authDomain ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    `${projectId}.firebaseapp.com`;
  const databaseId =
    cfg?.databaseId ||
    process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID ||
    "(default)";

  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        appId:
          cfg?.appId ||
          process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
          "1:1095528029824:web:bc3d2d2548ae9e0b211065",
      });

  const db =
    databaseId && databaseId !== "(default)"
      ? getFirestore(app, databaseId)
      : getFirestore(app);
  const storage = getStorage(app);

  return { app, db, storage };
}

