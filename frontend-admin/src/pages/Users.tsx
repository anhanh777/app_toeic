import { useEffect, useMemo, useState } from 'react';
import { api, type User } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Modal, Toggle } from '../components';
import { LoadingLine, useUiSettings } from '../uiSettings';

/* Quản lý tài khoản — thêm, sửa, xóa, cập nhật, đặt lại mật khẩu.
   Chỉ đặt lại MẬT KHẨU (không reset tiến độ học). Các luật bảo vệ ở
   backend cũng được thể hiện ở giao diện: không tự xóa / tự hạ quyền
   của mình, không xóa / hạ quyền admin cuối cùng. */
export default function Users() {
  const { user: me } = useAuth();
  const { settings } = useUiSettings();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all');

  const [createForm, setCreateForm] = useState({ email: '', password: '', name: '', role: 'user' as 'user' | 'admin' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'user' as 'user' | 'admin', targetScore: 650, hideOnLeaderboard: false });
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.adminUsers().then(setUsers).catch(setError).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (me?.role !== 'admin') {
    return <div className="card"><h1>Không có quyền truy cập</h1><p>Trang quản trị chỉ dành cho tài khoản admin. Tài khoản của bạn không có quyền xem trang này.</p></div>;
  }

  const adminCount = users.filter(u => u.role === 'admin').length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u =>
      (roleFilter === 'all' || u.role === roleFilter) &&
      (!q || u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)),
    );
  }, [users, search, roleFilter]);

  const isSelf = (u: User) => me != null && u.id === me.id;
  const isLastAdmin = (u: User) => u.role === 'admin' && adminCount <= 1;
  const cannotDelete = (u: User) => isSelf(u) || isLastAdmin(u);
  const cannotDemote = (u: User) => u.role === 'admin' && (isSelf(u) || isLastAdmin(u));
  const guardNote = (u: User) => {
    if (isSelf(u)) return 'Tài khoản của bạn — không thể tự xóa / tự hạ quyền.';
    if (isLastAdmin(u)) return 'Admin cuối cùng — không thể xóa / hạ quyền.';
    return '';
  };

  // Trang thai khoa/mo: tai khoan cu (chua co isActive) mac dinh la dang hoat dong.
  const isActive = (u: User) => u.isActive !== false;
  const activeAdminCount = users.filter(u => u.role === 'admin' && isActive(u)).length;
  // Chi chan KHOA (mo khoa thi luon cho phep): khong tu khoa minh,
  // khong khoa admin dang hoat dong cuoi cung.
  const cannotDeactivate = (u: User) => isActive(u) && (isSelf(u) || (u.role === 'admin' && activeAdminCount <= 1));
  const lockNote = (u: User) => {
    if (!isActive(u)) return '';
    if (isSelf(u)) return 'Tài khoản của bạn — không thể tự khóa.';
    if (u.role === 'admin' && activeAdminCount <= 1) return 'Admin đang hoạt động cuối cùng — không thể khóa.';
    return '';
  };

  const toggleActive = async (u: User) => {
    const next = !isActive(u);
    setError(null); setMsg(''); setTogglingId(u.id);
    try {
      const { user } = await api.adminUpdateUser(u.id, { isActive: next });
      setUsers(prev => prev.map(x => (x.id === u.id ? user : x)));
      setMsg(next ? `Đã mở khóa tài khoản ${u.email}.` : `Đã khóa tài khoản ${u.email} — tài khoản này không đăng nhập được nữa.`);
    } catch (err) { setError(err); } finally { setTogglingId(null); }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg('');
    if (createForm.password.length < 6) { setError(new Error('Mật khẩu phải có ít nhất 6 ký tự.')); return; }
    setBusy(true);
    try {
      const r = await api.adminCreateUser({
        email: createForm.email.trim(),
        password: createForm.password,
        name: createForm.name.trim() || undefined,
        role: createForm.role,
      });
      setMsg(`Đã tạo tài khoản ${r.user.email}.`);
      setCreateForm({ email: '', password: '', name: '', role: 'user' });
      load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const startEdit = (u: User) => {
    setEditingId(u.id);
    setEditForm({
      name: u.name || '',
      role: u.role,
      targetScore: u.targetScore ?? 650,
      hideOnLeaderboard: !!u.hideOnLeaderboard,
    });
    setResetId(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId == null) return;
    setError(null); setMsg(''); setBusy(true);
    try {
      await api.adminUpdateUser(editingId, {
        name: editForm.name.trim(),
        role: editForm.role,
        targetScore: editForm.targetScore,
        hideOnLeaderboard: editForm.hideOnLeaderboard,
      });
      setMsg('Đã cập nhật tài khoản.');
      setEditingId(null);
      load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const deleteUser = async (u: User) => {
    if (!confirm(`Xóa tài khoản "${u.email}" cùng toàn bộ dữ liệu học của tài khoản này?`)) return;
    setError(null); setMsg('');
    try {
      await api.adminDeleteUser(u.id);
      setMsg(`Đã xóa tài khoản ${u.email}.`);
      load();
    } catch (err) { setError(err); }
  };

  const resetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetId == null) return;
    if (resetPassword.length < 6) { setError(new Error('Mật khẩu mới phải có ít nhất 6 ký tự.')); return; }
    setError(null); setMsg(''); setBusy(true);
    try {
      await api.adminResetUserPassword(resetId, resetPassword);
      setMsg('Đã đặt lại mật khẩu. Nhớ gửi mật khẩu mới cho người dùng và nhắc họ đổi lại trong phần Hồ sơ.');
      setResetId(null); setResetPassword('');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const resetTarget = resetId != null ? users.find(u => u.id === resetId) : undefined;

  return (
    <div>
      <h1>👤 Quản lý tài khoản</h1>
      <p className="muted">Thêm, sửa, xóa tài khoản; cập nhật quyền và điểm mục tiêu; đặt lại mật khẩu. Tiến độ học của tài khoản chỉ bị xóa cùng lúc khi xóa tài khoản — không có nút reset tiến độ riêng.</p>
      <ErrorBox error={error} />
      {msg && <div className="success">{msg}</div>}
      {loading && <LoadingLine effect={settings.ui.loading.table} speed={settings.ui.loading.speed} text="Đang tải danh sách tài khoản…" />}

      <div className="split">
      <div className="card">
        <h2>Thêm tài khoản mới</h2>
        <form onSubmit={createUser}>
          <label>Email</label>
          <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required placeholder="VD: hocvien@example.com" />
          <label>Mật khẩu (ít nhất 6 ký tự)</label>
          <input type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required />
          <label>Tên hiển thị</label>
          <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Để trống thì dùng phần trước @" />
          <label>Quyền</label>
          <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value as 'user' | 'admin' })}>
            <option value="user">Học viên</option>
            <option value="admin">Admin</option>
          </select>
          <div className="btn-row">
            <button className="btn btn-block" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Danh sách tài khoản ({filtered.length}/{users.length})</h2>
        <div className="btn-row">
          <input style={{ flex: 1 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo email hoặc tên…" />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as 'all' | 'user' | 'admin')}>
            <option value="all">Tất cả quyền</option>
            <option value="user">Học viên</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="table-scroll">
        <table><thead><tr><th>Email</th><th>Tên</th><th>Quyền</th><th>Trạng thái</th><th>Điểm mục tiêu</th><th>Ngày tạo</th><th>Ẩn BXH</th><th></th></tr></thead><tbody>
          {filtered.map(u => (
            <tr key={u.id}>
              <td>{u.email}{isSelf(u) ? ' (bạn)' : ''}</td>
              <td>{u.name || '—'}</td>
              <td>{u.role === 'admin' ? 'Admin' : 'Học viên'}</td>
              <td>
                <div className="btn-row" style={{ alignItems: 'center' }}>
                  <Toggle checked={isActive(u)} onChange={() => void toggleActive(u)} disabled={togglingId === u.id || cannotDeactivate(u)} label={isActive(u) ? 'Đang hoạt động' : 'Đã khóa'} />
                  <span className="muted" style={{ fontSize: '.8rem' }}>{isActive(u) ? 'Đang hoạt động' : 'Đã khóa'}</span>
                </div>
                {lockNote(u) && <p className="muted">{lockNote(u)}</p>}
              </td>
              <td>{u.targetScore ?? 650}</td>
              <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
              <td>{u.hideOnLeaderboard ? '✓' : '—'}</td>
              <td>
                <div className="btn-row">
                  <button className="btn secondary btn-sm" onClick={() => startEdit(u)}>Sửa</button>
                  <button className="btn secondary btn-sm" onClick={() => { setResetId(u.id); setResetPassword(''); setEditingId(null); }}>Đặt lại MK</button>
                  <button className="btn danger btn-sm" disabled={cannotDelete(u)} title={guardNote(u) || 'Xóa tài khoản'} onClick={() => void deleteUser(u)}>Xóa</button>
                </div>
                {guardNote(u) && <p className="muted">{guardNote(u)}</p>}
              </td>
            </tr>
          ))}
        </tbody></table>
        </div>
        {filtered.length === 0 && !loading && <p className="muted">Không tìm thấy tài khoản nào.</p>}
      </div>
      </div>

      {editingId != null && (
        <Modal title={`Sửa tài khoản #${editingId}`} onClose={() => setEditingId(null)}>
          <form onSubmit={saveEdit}>
            <label>Tên hiển thị</label>
            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            <label>Quyền</label>
            <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value as 'user' | 'admin' })}
              disabled={editingId != null && users.find(u => u.id === editingId) != null && cannotDemote(users.find(u => u.id === editingId)!)}
            >
              <option value="user">Học viên</option>
              <option value="admin">Admin</option>
            </select>
            {editingId != null && users.find(u => u.id === editingId) != null && cannotDemote(users.find(u => u.id === editingId)!) && (
              <p className="muted">{guardNote(users.find(u => u.id === editingId)!)}</p>
            )}
            <label>Điểm TOEIC mục tiêu (10–990)</label>
            <input type="number" min={10} max={990} value={editForm.targetScore} onChange={e => setEditForm({ ...editForm, targetScore: Number(e.target.value) })} />
            <label><input type="checkbox" checked={editForm.hideOnLeaderboard} onChange={e => setEditForm({ ...editForm, hideOnLeaderboard: e.target.checked })} /> Ẩn khỏi bảng xếp hạng</label>
            <div className="btn-row">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
              <button type="button" className="btn secondary" onClick={() => setEditingId(null)}>Hủy</button>
            </div>
          </form>
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Đặt lại mật khẩu — ${resetTarget.email}`} onClose={() => { setResetId(null); setResetPassword(''); }}>
          <p className="muted">Đặt mật khẩu tạm mới cho tài khoản này. Gửi mật khẩu cho người dùng và nhắc họ đổi lại trong phần Hồ sơ sau khi đăng nhập.</p>
          <form onSubmit={resetUserPassword}>
            <label>Mật khẩu mới (ít nhất 6 ký tự)</label>
            <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required />
            <div className="btn-row">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}</button>
              <button type="button" className="btn secondary" onClick={() => { setResetId(null); setResetPassword(''); }}>Hủy</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
