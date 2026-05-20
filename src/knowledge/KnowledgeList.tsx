import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Eye, Filter, LibraryBig, Search } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { closeSession, stopHeartbeat } from '../lib/activityTracker';
import { formatThaiDate, getKnowledgeAssetUrl, type KnowledgeItem } from './knowledgeUtils';

function fallbackCover() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-600 via-blue-600 to-emerald-500 text-white">
      <LibraryBig size={58} strokeWidth={1.7} />
    </div>
  );
}

export default function KnowledgeList() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/items`);
      if (!res.ok) throw new Error('Cannot load knowledge items');
      setItems(await res.json());
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try { setUserData(JSON.parse(savedUser)); } catch { localStorage.removeItem('user'); }
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    void loadItems();
    return () => window.removeEventListener('resize', handleResize);
  }, [loadItems]);

  const categories = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  }, [items]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const haystack = `${item.title} ${item.category} ${item.description}`.toLowerCase();
      return matchesCategory && (!needle || haystack.includes(needle));
    });
  }, [categoryFilter, items, search]);

  const handleLogout = async () => {
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadItems().finally(() => setIsRefreshing(false));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1540px] flex-1 flex-col gap-8 px-4 py-8 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <LibraryBig size={14} /> คลังความรู้ สตท.8
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">คลังความรู้ทั้งหมด</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">เลือกเรื่องที่ต้องการอ่านและเปิดเอกสาร PDF ได้จากหน้านี้</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] lg:min-w-[560px]">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Search size={19} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหาชื่อเรื่อง หมวดหมู่ หรือรายละเอียด..."
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Filter size={18} className="text-blue-600" />
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="bg-transparent text-sm font-bold outline-none"
                >
                  <option value="all">ทุกหมวดหมู่</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-[420px] animate-pulse rounded-[1.75rem] border border-slate-100 bg-white shadow-sm" />
              ))
            ) : filteredItems.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <BookOpen className="mx-auto mb-3 text-slate-300" size={42} />
                <p className="font-bold text-slate-600">ไม่พบเรื่องตามเงื่อนไขที่ค้นหา</p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <a
                  key={item.item_id}
                  href={`/knowledge/${item.item_id}`}
                  className="group overflow-hidden rounded-[1.75rem] border border-slate-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(37,99,235,0.16)]"
                >
                  <div className="aspect-[1.55/1] overflow-hidden bg-slate-100">
                    {item.cover_url ? (
                      <img src={getKnowledgeAssetUrl(item.cover_url)} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : fallbackCover()}
                  </div>
                  <div className="flex min-h-[210px] flex-col p-6">
                    <h2 className="line-clamp-2 text-2xl font-black leading-snug text-slate-900">{item.title}</h2>
                    <p className="mt-3 line-clamp-1 text-lg font-semibold text-slate-400">{item.category || 'คลังความรู้'}</p>
                    <div className="mt-auto flex items-center justify-between pt-8 text-sm font-bold text-slate-400">
                      <span>{formatThaiDate(item.published_at || item.updated_at)}</span>
                      <span className="inline-flex items-center gap-2">
                        <Eye size={18} /> {Number(item.view_count || 0).toLocaleString('th-TH')}
                      </span>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
