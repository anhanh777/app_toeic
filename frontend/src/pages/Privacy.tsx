import { Link } from 'react-router-dom';

/**
 * Privacy.tsx — trang Chính sách bảo mật (công khai, không cần đăng nhập).
 * Google yêu cầu URL này để xuất bản ứng dụng OAuth (chế độ Production).
 */
export default function Privacy() {
  return (
    <div className="card" style={{ maxWidth: 720, margin: '1rem auto' }}>
      <h2>Chính sách bảo mật</h2>
      <p className="muted">Ứng dụng ANHANH — Luyện thi TOEIC &amp; IELTS. Cập nhật lần cuối: 18/11/2026.</p>

      <h3>1. Dữ liệu chúng tôi thu thập</h3>
      <p>
        Khi bạn đăng nhập bằng Google, chúng tôi nhận từ Google: địa chỉ email, tên hiển thị và ảnh đại diện của bạn.
        Khi bạn sử dụng ứng dụng, chúng tôi lưu: kết quả luyện tập và thi thử, câu trả lời sai, từ vựng bạn đã lưu,
        điểm kinh nghiệm (XP) và cài đặt học tập của bạn — để hiển thị tiến độ và bảng xếp hạng.
      </p>

      <h3>2. Mục đích sử dụng</h3>
      <p>
        Dữ liệu chỉ dùng để đăng nhập và lưu tiến độ học tập của chính bạn.
        Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho bất kỳ bên thứ ba nào.
      </p>

      <h3>3. Lưu trữ và bảo mật</h3>
      <p>
        Dữ liệu được lưu trên máy chủ của ứng dụng (Render) và ảnh/âm thanh bài học trên Cloudinary.
        Mật khẩu (nếu bạn đăng ký bằng email) được mã hóa và không lưu dưới dạng chữ thường.
      </p>

      <h3>4. Đăng nhập bằng Google</h3>
      <p>
        Ứng dụng chỉ nhận email, tên và ảnh đại diện từ Google để tạo tài khoản và đăng nhập cho bạn.
        Ứng dụng không đọc email, danh bạ hay bất kỳ dữ liệu nào khác trong tài khoản Google của bạn.
      </p>

      <h3>5. Quyền của bạn</h3>
      <p>
        Bạn có thể xem, sửa và xóa dữ liệu học tập của mình trong trang Hồ sơ và trang Từ vựng.
        Nếu muốn xóa tài khoản, hãy liên hệ với chúng tôi qua email hỗ trợ bên dưới.
      </p>

      <h3>6. Liên hệ</h3>
      <p>
        Mọi thắc mắc về chính sách này, vui lòng liên hệ: trananhhunter02@gmail.com.
      </p>

      <p><Link className="btn secondary btn-sm" to="/">← Về trang chủ</Link></p>
    </div>
  );
}
