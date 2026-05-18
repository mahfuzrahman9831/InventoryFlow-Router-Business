import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const createUserProfile = async (userId: string, email: string) => {
  const userRef = doc(db, 'users', userId);
  try {
    await setDoc(userRef, {
      email,
      createdAt: new Date().toISOString(),
      isAdmin: false
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
};

export const getCollectionRef = (userId: string, target: string) => {
  return collection(db, 'users', userId, target);
};

export const getDocRef = (userId: string, target: string, docId: string) => {
  return doc(db, 'users', userId, target, docId);
};

// Generic CRUD
export const fetchItems = async (userId: string, target: string) => {
  const path = `users/${userId}/${target}`;
  try {
    const q = query(getCollectionRef(userId, target));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return []; // Never reached but satisfies TS
  }
};

export const createItem = async (userId: string, target: string, data: any) => {
  const path = `users/${userId}/${target}`;
  try {
    const colRef = getCollectionRef(userId, target);
    const docRef = await addDoc(colRef, { ...data, createdAt: new Date().toISOString() });
    return { id: docRef.id, ...data };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return null; // Never reached
  }
};

export const updateItem = async (userId: string, target: string, docId: string, data: any) => {
  const path = `users/${userId}/${target}/${docId}`;
  try {
    const docRef = getDocRef(userId, target, docId);
    await updateDoc(docRef, { ...data, updatedAt: new Date().toISOString() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deleteItem = async (userId: string, target: string, docId: string) => {
  const path = `users/${userId}/${target}/${docId}`;
  try {
    const docRef = getDocRef(userId, target, docId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const fetchItemById = async (userId: string, target: string, docId: string) => {
  const path = `users/${userId}/${target}/${docId}`;
  try {
    const docRef = getDocRef(userId, target, docId);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
};
