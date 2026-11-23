import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Label } from '../components/ui';
import { DEFAULT_MONTH_NAMES, extractSpreadsheetId } from '../lib/sheets';
import { runConnectionCheck } from '../lib/syncRunner';
import { useSettings } from '../settingsContext';
import { useTheme } from '../theme';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update, serviceAccount, setServiceAccountFromJson, removeServiceAccount } = useSettings();

  // --- credentials ---------------------------------------------------------
  const [json, setJson] = useState('');
  const [credMsg, setCredMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingCred, setSavingCred] = useState(false);

  const saveCredentials = async (raw: string) => {
    setSavingCred(true);
    setCredMsg(null);
    try {
      const sa = await setServiceAccountFromJson(raw);
      setJson('');
      setCredMsg({ ok: true, text: `Saved credentials for ${sa.client_email}` });
    } catch (e) {
      setCredMsg({ ok: false, text: errMsg(e) });
    } finally {
      setSavingCred(false);
    }
  };

  const importFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await (await fetch(res.assets[0].uri)).text();
      await saveCredentials(text);
    } catch (e) {
      setCredMsg({ ok: false, text: `Could not read the file: ${errMsg(e)}` });
    }
  };

  // --- spreadsheet ---------------------------------------------------------
  const [sheetInput, setSheetInput] = useState(settings.spreadsheetId);
  const [tabInput, setTabInput] = useState(settings.tabTemplate);
  const [monthsInput, setMonthsInput] = useState(settings.monthNames.join(', '));
  const [daysInput, setDaysInput] = useState(String(settings.daysBack));
  const [sheetMsg, setSheetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Settings load asynchronously on first launch; mirror them into the inputs once.
  useEffect(() => {
    setSheetInput(settings.spreadsheetId);
    setTabInput(settings.tabTemplate);
    setMonthsInput(settings.monthNames.join(', '));
    setDaysInput(String(settings.daysBack));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Validates the inputs and persists them. Returns the normalised settings or null. */
  const saveSheetSettings = () => {
    const spreadsheetId = extractSpreadsheetId(sheetInput);
    const months = monthsInput.split(',').map((m) => m.trim());
    if (months.length !== 12 || months.some((m) => !m)) {
      setSheetMsg({ ok: false, text: 'Month names: enter exactly 12 names separated by commas.' });
      return null;
    }
    const days = Math.min(7, Math.max(1, parseInt(daysInput, 10) || 1));
    const next = { spreadsheetId, tabTemplate: tabInput.trim() || '{year}', monthNames: months, daysBack: days };
    update(next);
    setSheetInput(next.spreadsheetId);
    setTabInput(next.tabTemplate);
    setDaysInput(String(days));
    return { ...settings, ...next };
  };

  const onSaveSheet = () => {
    if (saveSheetSettings()) setSheetMsg({ ok: true, text: 'Saved.' });
  };

  const onTest = async () => {
    const next = saveSheetSettings();
    if (!next) return;
    setTesting(true);
    setSheetMsg(null);
    try {
      const r = await runConnectionCheck(next, serviceAccount);
      if (!r.tabFound) {
        setSheetMsg({ ok: false, text: `Connected to “${r.title}”, but no tab named “${r.tabName}” exists.` });
      } else if (r.monthHeaderRow === null) {
        setSheetMsg({ ok: false, text: `Connected to “${r.title}” / tab “${r.tabName}”, but this month's name was not found in column B. Check the month names.` });
      } else {
        setSheetMsg({ ok: true, text: `Connected to “${r.title}” / tab “${r.tabName}”. Current month header found on row ${r.monthHeaderRow}.` });
      }
    } catch (e) {
      setSheetMsg({ ok: false, text: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: t.input, borderColor: t.border, color: t.text }];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <Text style={[styles.title, { color: t.text }]}>Settings</Text>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ---------------- Service account ---------------- */}
        <Card>
          <Text style={[styles.h, { color: t.text }]}>Google service account</Text>
          {serviceAccount ? (
            <>
              <Text style={{ color: t.ok, marginTop: 6 }}>● Configured</Text>
              <Text selectable style={{ color: t.text, marginTop: 4 }}>{serviceAccount.client_email}</Text>
              <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>
                Share your spreadsheet with this e-mail address as “Editor”. The private key is kept in the device's secure storage.
              </Text>
              <Button title="Remove credentials" variant="danger" onPress={removeServiceAccount} style={{ marginTop: 12 }} />
            </>
          ) : (
            <Text style={{ color: t.muted, marginTop: 6 }}>
              Create a service account in Google Cloud, enable the Google Sheets API, create a JSON key and paste it below or import the file.
            </Text>
          )}

          <Label>{serviceAccount ? 'Replace with a new key' : 'Service-account JSON'}</Label>
          <TextInput
            value={json}
            onChangeText={setJson}
            multiline
            placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }'
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[...inputStyle, { minHeight: 110, textAlignVertical: 'top', fontSize: 12 }]}
          />
          <View style={styles.row}>
            <Button title="Import .json file" variant="secondary" onPress={importFile} style={{ flex: 1 }} />
            <Button title="Save" onPress={() => saveCredentials(json)} loading={savingCred} disabled={!json.trim()} style={{ flex: 1 }} />
          </View>
          {credMsg && <Text style={{ color: credMsg.ok ? t.ok : t.danger, marginTop: 10 }}>{credMsg.text}</Text>}
        </Card>

        {/* ---------------- Spreadsheet ---------------- */}
        <Card>
          <Text style={[styles.h, { color: t.text }]}>Google spreadsheet</Text>

          <Label>Spreadsheet ID or URL</Label>
          <TextInput
            value={sheetInput}
            onChangeText={setSheetInput}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />

          <Label>Tab name</Label>
          <TextInput value={tabInput} onChangeText={setTabInput} placeholder="{year}" placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} style={inputStyle} />
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
            “{'{year}'}” is replaced by the year being synced (tab “2026” for 2026 dates).
          </Text>

          <Label>Month names (column B, 12 values)</Label>
          <TextInput value={monthsInput} onChangeText={setMonthsInput} multiline autoCapitalize="none" autoCorrect={false} style={[...inputStyle, { fontSize: 13 }]} />
          <Button title="Reset to Portuguese" variant="secondary" onPress={() => setMonthsInput(DEFAULT_MONTH_NAMES.join(', '))} style={{ marginTop: 8, minHeight: 36, paddingVertical: 6 }} />

          <Label>Days to sync (1–7, today included)</Label>
          <TextInput value={daysInput} onChangeText={setDaysInput} keyboardType="number-pad" style={[...inputStyle, { width: 90 }]} />
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
            Android only keeps detailed usage for about a week, so older days cannot be synced.
          </Text>

          <View style={[styles.row, { marginTop: 14 }]}>
            <Button title="Save" variant="secondary" onPress={onSaveSheet} style={{ flex: 1 }} />
            <Button title="Save & test" onPress={onTest} loading={testing} disabled={!serviceAccount} style={{ flex: 1 }} />
          </View>
          {sheetMsg && <Text style={{ color: sheetMsg.ok ? t.ok : t.danger, marginTop: 10 }}>{sheetMsg.text}</Text>}
        </Card>

        <Card>
          <Text style={[styles.h, { color: t.text }]}>How values are written</Text>
          <Text style={{ color: t.muted, marginTop: 6, lineHeight: 20 }}>
            For each selected app and day, the total <Text style={{ fontWeight: '700' }}>minutes</Text> are written to the cell in the row named after the app, under the month header, in the column for that day (1 → C, 2 → D …), in gray font. Cells with formulas are never overwritten and apps with no usage are skipped.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 10 },
  h: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
});
