
const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  keyFile: "./service-account.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID";

async function insertData() {
  const client = await auth.getClient();

  const sheets = google.sheets({
    version: "v4",
    auth: client,
  });

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sheet1!A:D",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        ["Mateus", "mateus@email.com", 22, "Brazil"],
        ["John", "john@email.com", 25, "USA"],
      ],
    },
  });

  console.log("Inserted successfully!");
  console.log(response.data);
}

insertData().catch(console.error);
