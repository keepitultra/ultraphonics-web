import { createContext, useContext, useEffect, useState } from 'react';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { app } from '../firebase-config.js';

const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(console.error);

async function isUidAllowed(uid) {
  const snap = await getDoc(doc(db, 'allowedUsers', uid));
  return snap.exists();
}

async function syncMemberProfile(firebaseUser) {
  const firstName = firebaseUser.displayName?.split(' ')[0] || firebaseUser.displayName || '';
  await setDoc(doc(db, 'allowedUsers', firebaseUser.uid), {
    displayName: firebaseUser.displayName || '',
    firstName,
    photoURL: firebaseUser.photoURL || '',
    email: firebaseUser.email || '',
    lastSeen: new Date().toISOString(),
  }, { merge: true });
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const allowed = await isUidAllowed(firebaseUser.uid);
        if (!allowed) {
          await signOut(auth);
          setUser(null);
        } else {
          syncMemberProfile(firebaseUser).catch(console.error);
          setUser(firebaseUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const allowed = await isUidAllowed(result.user.uid);
    if (!allowed) {
      await signOut(auth);
      throw new Error('Access denied. Your account is not authorized.');
    }
    return result.user;
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
