export const firebaseConfig = {
  "projectId": "emerce-ac815",
  "appId": "1:274469504137:web:de10b34aa916da01d3f258",
  "apiKey": "AIzaSyDCN9y5Uy5Wks_WQscBWZMlBSpshxf4uoc",
  "authDomain": "emerce-ac815.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "274469504137",
  // Add your Realtime Database URL here to enable video calls, presence, and live logs.
  // Format: "https://<project-id>-default-rtdb.firebaseio.com"
  // Get it from: Firebase Console → Realtime Database → Data tab (top of page)
  "databaseURL": process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
};
