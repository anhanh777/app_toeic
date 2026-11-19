// /profile — alias của /settings như web (App.tsx:317: route
// /profile render cùng màn Settings). Không duplicate logic:
// render lại component Settings.
import SettingsScreen from './settings';

export default function ProfileScreen() {
  return <SettingsScreen />;
}
