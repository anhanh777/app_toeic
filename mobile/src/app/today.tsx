// Màn Hôm nay đã gộp vào Trang chủ (app/index.tsx) — file này chỉ còn
// redirect để deep link / bookmark cũ không 404. Route /today vẫn tồn
// tại dạng redirect (Stack.Screen name="today" trong _layout.tsx giữ nguyên).
import { Redirect } from 'expo-router';

export default function TodayRedirect() {
  return <Redirect href="/" />;
}
