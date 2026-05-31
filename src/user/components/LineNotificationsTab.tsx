import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Check, Loader2, MessageCircle, Plus, RefreshCw, Save, Send, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE } from '../../lib/apiConfig';

const API = `${API_BASE}/api/admin`;

type LineGroup = {
  group_ref_id: number;
  group_name: string;
  group_id: string;
  is_active: boolean;
  last_verified_at?: string | null;
  last_error?: string | null;
};

type LineTopic = {
  menu_id: number;
  menu_key: string;
  menu_name: string;
  menu_icon: string;
  menu_href: string;
  sort_order: number;
  is_active: number;
  is_enabled: boolean;
  group_ref_ids: number[];
};

type LineConfig = {
  ready: boolean;
  channel_id: string;
  has_channel_secret: boolean;
  missing: string[];
};

type LineWebhookEvent = {
  webhook_event_id: number;
  source_type?: string | null;
  event_type?: string | null;
  group_id?: string | null;
  room_id?: string | null;
  user_id?: string | null;
  message_text?: string | null;
  received_at?: string | null;
};

type LineWebhookStatus = {
  endpoint_status?: {
    webhook_url?: string;
    endpoint?: string;
    active?: boolean;
  } | null;
  endpoint_error?: string;
  recent_events?: LineWebhookEvent[];
};

function uniqueNumbers(values: number[]) {
  return [...new Set(values.filter(value => Number.isFinite(value) && value > 0))];
}

export function LineNotificationsTab({ userId }: { userId?: number }) {
  const [topics, setTopics] = useState<LineTopic[]>([]);
  const [groups, setGroups] = useState<LineGroup[]>([]);
  const [lineConfig, setLineConfig] = useState<LineConfig | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<LineWebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  const activeGroups = useMemo(() => groups.filter(group => group.is_active), [groups]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/line-notification-settings`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'โหลดตั้งค่า LINE ไม่สำเร็จ');
        return;
      }
      setTopics(Array.isArray(data.topics) ? data.topics : []);
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setLineConfig(data.line_config || null);
      setWebhookStatus(data.webhook_status || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const toggleTopic = useCallback((menuKey: string) => {
    setTopics(current => current.map(topic => (
      topic.menu_key === menuKey ? { ...topic, is_enabled: !topic.is_enabled } : topic
    )));
  }, []);

  const toggleTopicGroup = useCallback((menuKey: string, groupRefId: number) => {
    setTopics(current => current.map(topic => {
      if (topic.menu_key !== menuKey) return topic;
      const exists = topic.group_ref_ids.includes(groupRefId);
      const groupRefIds = exists
        ? topic.group_ref_ids.filter(id => id !== groupRefId)
        : uniqueNumbers([...topic.group_ref_ids, groupRefId]);
      return { ...topic, group_ref_ids: groupRefIds };
    }));
  }, []);

  const saveSettings = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/line-notification-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId || null,
          topics: topics.map(topic => ({
            menu_key: topic.menu_key,
            is_enabled: topic.is_enabled,
            group_ref_ids: topic.group_ref_ids,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'บันทึกตั้งค่า LINE ไม่สำเร็จ');
        return;
      }
      toast.success(data.message || 'บันทึกตั้งค่า LINE แล้ว');
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }, [loadSettings, saving, topics, userId]);

  const createGroup = useCallback(async () => {
    if (creating) return;
    if (!newGroupId.trim()) {
      toast.warning('กรุณากรอก LINE groupId');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API}/line-notification-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_name: newGroupName.trim(), group_id: newGroupId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'เพิ่ม LINE group ไม่สำเร็จ');
        return;
      }
      toast.success(data.message || 'เพิ่ม LINE group แล้ว');
      setNewGroupName('');
      setNewGroupId('');
      await loadSettings();
    } finally {
      setCreating(false);
    }
  }, [creating, loadSettings, newGroupId, newGroupName]);

  const setupWebhook = useCallback(async () => {
    if (settingWebhook) return;
    setSettingWebhook(true);
    try {
      const res = await fetch(`${API}/line-webhook/setup`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'ตั้งค่า Webhook ไม่สำเร็จ');
        return;
      }
      toast.success(data.message || 'ตั้งค่า Webhook แล้ว');
      await loadSettings();
    } finally {
      setSettingWebhook(false);
    }
  }, [loadSettings, settingWebhook]);

  const testWebhook = useCallback(async () => {
    if (testingWebhook) return;
    setTestingWebhook(true);
    try {
      const res = await fetch(`${API}/line-webhook/test`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || data.message || 'ทดสอบ Webhook ไม่สำเร็จ');
        return;
      }
      toast.success(data.message || 'ทดสอบ Webhook สำเร็จ');
      await loadSettings();
    } finally {
      setTestingWebhook(false);
    }
  }, [loadSettings, testingWebhook]);

  const updateGroup = useCallback(async (group: LineGroup, patch: Partial<LineGroup>) => {
    const res = await fetch(`${API}/line-notification-groups/${group.group_ref_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_name: patch.group_name ?? group.group_name,
        group_id: patch.group_id ?? group.group_id,
        is_active: patch.is_active ?? group.is_active,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'บันทึก LINE group ไม่สำเร็จ');
      return;
    }
    toast.success(data.message || 'บันทึก LINE group แล้ว');
    await loadSettings();
  }, [loadSettings]);

  const deleteGroup = useCallback(async (group: LineGroup) => {
    if (!confirm(`ลบ LINE group "${group.group_name}" ใช่หรือไม่?`)) return;
    const res = await fetch(`${API}/line-notification-groups/${group.group_ref_id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'ลบ LINE group ไม่สำเร็จ');
      return;
    }
    toast.success(data.message || 'ลบ LINE group แล้ว');
    await loadSettings();
  }, [loadSettings]);

  const sendTest = useCallback(async (group: LineGroup) => {
    if (testingId) return;
    setTestingId(group.group_ref_id);
    try {
      const res = await fetch(`${API}/line-notifications/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_ref_id: group.group_ref_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'ส่งข้อความทดสอบไม่สำเร็จ');
        return;
      }
      toast.success(data.message || 'ส่งข้อความทดสอบแล้ว');
    } finally {
      setTestingId(null);
    }
  }, [testingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl bg-white/80 py-16 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <Loader2 className="animate-spin text-emerald-600" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border px-5 py-4 ${lineConfig?.ready ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${lineConfig?.ready ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white'}`}>
              <MessageCircle size={22} />
            </div>
            <div>
              <p className="font-black text-slate-800">LINE Messaging API</p>
              <p className="text-sm font-semibold text-slate-500">
                {lineConfig?.ready ? 'พร้อมส่งเข้า LINE กลุ่ม' : `ยังไม่ได้ตั้งค่า ${lineConfig?.missing?.join(', ') || 'LINE token'}`}
              </p>
            </div>
          </div>
          <span className={`inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${lineConfig?.ready ? 'bg-white text-emerald-700' : 'bg-white text-amber-700'}`}>
            {lineConfig?.ready ? <Check size={14} /> : <X size={14} />}
            {lineConfig?.ready ? 'พร้อมใช้งาน' : 'ยังไม่พร้อม'}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-white bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-blue-600" />
            <span className="text-sm font-bold text-slate-700">Webhook ตรวจจับ groupId</span>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${
              webhookStatus?.endpoint_status?.active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {webhookStatus?.endpoint_status?.active ? 'เปิดอยู่' : 'ยังไม่เปิด'}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={setupWebhook}
              disabled={settingWebhook}
              className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 disabled:opacity-50"
            >
              {settingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              ตั้งค่า Webhook
            </button>
            <button
              onClick={testWebhook}
              disabled={testingWebhook}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50"
            >
              {testingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              ทดสอบ Webhook
            </button>
            <button
              onClick={loadSettings}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-500 transition-all hover:bg-slate-100"
            >
              <RefreshCw size={14} />
              โหลดใหม่
            </button>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase text-slate-400">Webhook URL</p>
            <p className="mt-1 break-all font-mono text-xs font-bold text-slate-600">
              {webhookStatus?.endpoint_status?.webhook_url || 'https://region8.vercel.app/webhook/line'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase text-slate-400">LINE Console</p>
            <p className="mt-1 break-all font-mono text-xs font-bold text-slate-600">
              {webhookStatus?.endpoint_status?.endpoint || 'ยังไม่พบ endpoint จาก LINE'}
            </p>
          </div>
        </div>

        {webhookStatus?.endpoint_error && (
          <div className="mx-5 mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {webhookStatus.endpoint_error}
          </div>
        )}

        <div className="px-5 pb-5">
          {(webhookStatus?.recent_events || []).length === 0 ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              ยังไม่พบ webhook จาก LINE ให้กด “ตั้งค่า Webhook” แล้วส่งข้อความในกลุ่มที่มีบอทอยู่ จากนั้นกด “โหลดใหม่”
            </div>
          ) : (
            <div className="space-y-2">
              {(webhookStatus?.recent_events || []).slice(0, 3).map(event => {
                const idText = event.group_id || event.room_id || event.user_id || '-';
                const isGroup = event.source_type === 'group' && Boolean(event.group_id);
                return (
                  <div key={event.webhook_event_id} className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                    isGroup ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-amber-50 text-amber-800'
                  }`}>
                    <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                      <span>{isGroup ? 'พบ LINE groupId แล้ว' : `พบ source: ${event.source_type || '-'}`}</span>
                      <span className="font-mono text-xs">{event.received_at || ''}</span>
                    </div>
                    <div className="mt-1 break-all font-mono text-xs">{idText}</div>
                    {!isGroup && event.source_type === 'room' && (
                      <p className="mt-1 text-xs">รายการนี้เป็น roomId ไม่ใช่ groupId จึงยังไม่เพิ่มเป็นกลุ่มแจ้งเตือน</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <MessageCircle size={16} className="text-emerald-600" />
          <span className="text-sm font-bold text-slate-700">LINE Groups</span>
          <span className="ml-auto text-xs font-bold text-slate-400">{groups.length} กลุ่ม</span>
          <button
            onClick={loadSettings}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-500 transition-all hover:bg-slate-100"
          >
            <RefreshCw size={14} />
            โหลดใหม่
          </button>
        </div>

        <div className="px-5 pt-5">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            ส่งข้อความใน LINE กลุ่มที่มีบอทอยู่แล้วกด “โหลดใหม่” ระบบจะเพิ่ม groupId ให้อัตโนมัติ หากบอทตอบกลับเอง ให้ปิด Auto-reply messages และ Greeting messages ใน LINE Official Account Manager
          </div>
        </div>

        <div className="grid gap-3 p-5 lg:grid-cols-[1fr_1fr_auto]">
          <input
            value={newGroupName}
            onChange={event => setNewGroupName(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="ชื่อกลุ่ม เช่น กลุ่มแจ้งเตือน สตท.8"
          />
          <input
            value={newGroupId}
            onChange={event => setNewGroupId(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="LINE groupId เช่น Cxxxxxxxx"
          />
          <button
            onClick={createGroup}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            เพิ่มกลุ่ม
          </button>
        </div>

        {groups.length > 0 && (
          <div className="divide-y divide-slate-50">
            {groups.map(group => (
              <div key={group.group_ref_id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1.4fr)_auto] lg:items-center">
                <div>
                  <input
                    value={group.group_name}
                    onChange={event => setGroups(current => current.map(item => item.group_ref_id === group.group_ref_id ? { ...item, group_name: event.target.value } : item))}
                    onBlur={event => updateGroup(group, { group_name: event.target.value })}
                    className="w-full rounded-xl border border-transparent bg-slate-50 px-3 py-2 text-sm font-black text-slate-700 outline-none focus:border-emerald-200"
                  />
                </div>
                <div className="truncate rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-500">
                  {group.group_id}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => updateGroup(group, { is_active: !group.is_active })}
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black ${group.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
                  >
                    {group.is_active ? <Check size={14} /> : <X size={14} />}
                    {group.is_active ? 'เปิด' : 'ปิด'}
                  </button>
                  <button onClick={() => sendTest(group)} disabled={testingId === group.group_ref_id || !group.is_active}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 disabled:opacity-40">
                    {testingId === group.group_ref_id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    ทดสอบ
                  </button>
                  <button onClick={() => deleteGroup(group)} className="rounded-xl bg-red-50 p-2 text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <BellRing size={16} className="text-blue-600" />
          <span className="text-sm font-bold text-slate-700">หัวข้อแจ้งเตือน</span>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            บันทึก
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {topics.map(topic => (
            <div key={topic.menu_key} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(220px,1fr)_minmax(280px,1.5fr)]">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleTopic(topic.menu_key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-all ${topic.is_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${topic.is_enabled ? 'left-6' : 'left-1'}`} />
                </button>
                <div>
                  <p className="font-black text-slate-800">{topic.menu_name}</p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-400">{topic.menu_key}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeGroups.length === 0 ? (
                  <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400">ยังไม่มี LINE group ที่เปิดใช้งาน</span>
                ) : activeGroups.map(group => {
                  const checked = topic.group_ref_ids.includes(group.group_ref_id);
                  return (
                    <button
                      key={group.group_ref_id}
                      onClick={() => toggleTopicGroup(topic.menu_key, group.group_ref_id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                        checked
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded ${checked ? 'bg-emerald-600 text-white' : 'bg-white text-transparent'}`}>
                        <Check size={11} />
                      </span>
                      {group.group_name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
