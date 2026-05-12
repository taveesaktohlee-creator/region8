import { useState, useEffect, useRef } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE } from '../lib/apiConfig';

interface UserConfirm {
  id: number;
  Name_Surname: string;
  position: string;
  type: string;
  Division_Province: string;
  Department: string;
}

export default function Register() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserConfirm[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserConfirm | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });

  const [isVisible, setIsVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [, setIsLoading] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setSelectedUser(null);
    setShowDropdown(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length > 0) {
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/users/search-confirm?q=${encodeURIComponent(value)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data);
          }
        } catch (error) {
          console.error("Error fetching data", error);
        } finally {
          setIsSearching(false);
        }
      }, 500);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  const handleSelectUser = (user: UserConfirm) => {
    setSelectedUser(user);
    setSearchTerm(user.Name_Surname);
    setShowDropdown(false);
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) {
      toast.error('กรุณาค้นหาและเลือกชื่อ-นามสกุลจากระบบ');
      return;
    }

    if (!validateEmail(formData.email)) {
      toast.error('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }

    if (!formData.username) {
      toast.error('กรุณากรอกชื่อผู้ใช้งาน');
      return;
    }

    if (formData.password.length < 8) {
      toast.error('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('รหัสผ่านไม่ตรงกัน');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/users/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...selectedUser,
          email: formData.email,
          username: formData.username,
          password: formData.password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
      } else {
        toast.success('ลงทะเบียนเรียบร้อยแล้ว');
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }
    } catch (error) {
      toast.error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sky-50 p-4">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="max-w-xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden p-8 md:p-12 relative">

        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">ลงทะเบียนใช้งาน</h2>
          <p className="text-gray-500 font-medium">สำนักงานตรวจบัญชีสหกรณ์ที่ 8</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>

          <div className="flex flex-col gap-2 relative" ref={wrapperRef}>
            <label className="text-sm font-semibold text-gray-700">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                type="text"
                placeholder="พิมพ์ค้นหาชื่อ-นามสกุล..."
                value={searchTerm}
                onChange={handleSearch}
              />

              {showDropdown && searchTerm.trim().length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto top-full left-0">
                  {isSearching ? (
                    <div className="p-4 flex items-center justify-center text-gray-500">
                      <Spinner size="sm" /> <span className="ml-2">กำลังค้นหา...</span>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <ul>
                      {searchResults.map((user: any) => (
                        <li
                          key={user.id}
                          className="px-4 py-3 hover:bg-sky-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                          onClick={() => handleSelectUser(user)}
                        >
                          <div className="font-semibold text-gray-800">{user.Name_Surname}</div>
                          <div className="text-xs text-gray-500">{user.position || '-'} | {user.Department || '-'}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-center text-gray-500 flex flex-col items-center">
                      <AlertCircle size={24} className="mb-1 text-gray-400" />
                      <span>ไม่พบข้อมูล</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">กรุณาพิมพ์ชื่อของท่านเพื่อค้นหาและเลือกจากรายการ</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">อีเมล <span className="text-red-500">*</span></label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="example@email.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">ชื่อผู้ใช้งาน <span className="text-red-500">*</span></label>
            <Input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="ตั้งชื่อผู้ใช้งาน"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">รหัสผ่าน <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                type={isVisible ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="อย่างน้อย 8 ตัวอักษร"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none" type="button" onClick={() => setIsVisible(!isVisible)}>
                {isVisible ? (
                  <EyeOff className="text-xl text-default-400 pointer-events-none" />
                ) : (
                  <Eye className="text-xl text-default-400 pointer-events-none" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">ยืนยันรหัสผ่าน <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                type={isConfirmVisible ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="กรอกรหัสผ่านอีกครั้ง"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none" type="button" onClick={() => setIsConfirmVisible(!isConfirmVisible)}>
                {isConfirmVisible ? (
                  <EyeOff className="text-xl text-default-400 pointer-events-none" />
                ) : (
                  <Eye className="text-xl text-default-400 pointer-events-none" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-semibold py-6 rounded-xl shadow-lg shadow-sky-500/30 transition-all flex items-center justify-center gap-2 text-base"
            >
              ลงทะเบียน
            </Button>

            <Button
              variant="outline"
              onPress={() => window.location.href = '/'}
              className="w-full border-2 border-sky-100 text-sky-600 hover:bg-sky-50 hover:border-sky-200 font-semibold py-6 rounded-xl transition-all text-base"
            >
              กลับไปหน้าล็อกอิน
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
