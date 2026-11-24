<h1 align="center">
  <p>Usage Sync</p>
</h1>

<p>
  <img src="https://img.shields.io/badge/Platform-Android-green">
</p>

## Description

Usage Sync is an Android app that reads per-app screen time, displays usage hour by hour, and syncs daily totals to a Google Sheet. Choose which apps to track and map them to rows in your spreadsheet

- [Features](#features)
- [How to Run](#how-to-run)
- [Google Sheets Setup](#google-sheets-setup)
- [Spreadsheet Layout](#spreadsheet-layout)
- [Technologies Used](#technologies-used)
- [Authors](#authors)

## Features

📊 **Hourly usage:** view a 24-hour chart for each selected app and browse previous days

📱 **App selection:** search installed apps and remember the apps to track and sync

🔄 **Google Sheets sync:** write daily usage totals and review which entries were synced or skipped

## How to Run

This project includes a native Kotlin Expo module for Android usage statistics, so it cannot run in Expo Go

1. Install dependencies with `npm install`

2. Run `npm run android` (Android SDK are required)

3. Build with `npm run build:android`

### Google Sheets Setup

1. In Google Cloud Console, create a project and enable the `Google Sheets API`

2. Create a service account and download a JSON key

3. Share the target spreadsheet with the service account's `client_email` as an `Editor`

4. In app, open `Settings`, import the JSON key and enter the spreadsheet URL

### Spreadsheet Layout

- Month headers are in column `B`, with that month's app rows beneath each header
- Day numbers 1–31 use columns `C–AG` (day 1 is column C)

## Technologies Used

<p align="left">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Native">
  <img src="https://img.shields.io/badge/Expo-1C1E24?style=for-the-badge&logo=expo&logoColor=white" alt="Expo">
  <img src="https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white" alt="Google Cloud">
  <img src="https://img.shields.io/badge/Google_Sheets-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" alt="Google Sheets API">
</p>

## Authors

| Mateus Pitura |
| --- |
| <p align="center"><img src="https://avatars.githubusercontent.com/u/119008106" width="100" height="100" alt="Mateus Pitura"></p> |
| <a href="https://url.mateuspitura.com?q=linkedin.com/in/mateuspitura/"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a> |
