// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { api } from "../lib/supabase";

/*
  Pastel-styled Dashboard.jsx — corrected imports & colored
  (Single top-level import section; no stray imports in the file body)
*/

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const pullRef = useRef(null);
  const touchStartY = useRef(0);
  const pullDistance = useRef(0);

  const fetch = async () => {
    try {
      setIsLoading(true);
      const data = await api.fetchLeads();
      setLeads(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 10000);
    let unsub;
    if (api.onLeadsChange) {
      try {
        unsub = api.onLeadsChange((updated) => {
          setLeads((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            updated.forEach((u) => map.set(u.id, u));
            return Array.from(map.values()).sort(
              (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
            );
          });
          setLastUpdated(new Date());
          updated.forEach((u) => {
            setNotifications((n) =>
              [
                { id: u.id + "-notif", text: `Lead ${u.name || u.full_name || "Untitled"} updated`, time: new Date() },
                ...n,
              ].slice(0, 20)
            );
          });
        });
      } catch (e) {
        // ignore
      }
    }
    return () => {
      clearInterval(id);
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeStatus = (s) => (s || "unknown").toString().toLowerCase();

  const STATUS_COLORS = {
    new: "#7dd3fc",
    contacted: "#34d399",
    qualified: "#fbbf24",
    lost: "#fb7185",
    customer: "#c7b8ff",
    unknown: "#cbd5e1",
    default: "#9ca3af",
  };

  const colorForStatus = (s) => STATUS_COLORS[normalizeStatus(s)] || STATUS_COLORS.default;

  const byStatus = useMemo(() => {
    return leads.reduce((acc, lead) => {
      const s = normalizeStatus(lead.status);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
  }, [leads]);

  const total = leads.length;

  const pieData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

  const trend = useMemo(() => {
    const map = {};
    leads.forEach((l) => {
      const d = new Date(l.created_at || l.createdAt || Date.now());
      const key = d.toISOString().slice(0, 10);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = leads.filter((l) => {
      if (statusFilter !== "all" && normalizeStatus(l.status) !== normalizeStatus(statusFilter)) return false;
      if (!q) return true;
      return (
        (l.name || l.full_name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.company || "").toLowerCase().includes(q) ||
        (l.phone || "").toLowerCase().includes(q)
      );
    });

    if (sortBy === "recent") items = items.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (sortBy === "oldest") items = items.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

    return items;
  }, [leads, query, statusFilter, sortBy]);

  const fmt = (d) => {
    if (!d) return "-";
    const dt = new Date(d);
    return dt.toLocaleString();
  };

  const heatmapData = useMemo(() => {
    const days = 90;
    const res = [];
    const today = new Date();
    const map = {};
    leads.forEach((l) => {
      const d = new Date(l.created_at || l.createdAt || Date.now());
      const key = d.toISOString().slice(0, 10);
      map[key] = (map[key] || 0) + 1;
    });
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      res.push({ day: key, count: map[key] || 0, date: new Date(key) });
    }
    return res;
  }, [leads]);

  const leaderboard = useMemo(() => {
    const map = {};
    leads.forEach((l) => {
      const team = (l.owner && l.owner.name) || l.owner || l.team || "Unassigned";
      map[team] = map[team] || { team, leads: 0, customers: 0, revenue: 0 };
      map[team].leads++;
      if (normalizeStatus(l.status) === "customer") {
        map[team].customers++;
        map[team].revenue += Number(l.amount || 0);
      }
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [leads]);

  const revenueSeries = useMemo(() => {
    const map = {};
    leads.forEach((l) => {
      if (!l.amount) return;
      const d = new Date(l.created_at || l.createdAt || Date.now());
      const key = d.toISOString().slice(0, 7);
      map[key] = (map[key] || 0) + Number(l.amount || 0);
    });
    const series = Object.entries(map)
      .map(([m, v]) => ({ month: m, revenue: v }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const points = series.slice(-6);
    let projections = [];
    if (points.length >= 2) {
      const xs = points.map((_, i) => i);
      const ys = points.map((p) => p.revenue);
      const n = xs.length;
      const xMean = xs.reduce((s, x) => s + x, 0) / n;
      const yMean = ys.reduce((s, y) => s + y, 0) / n;
      let num = 0,
        den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - xMean) * (ys[i] - yMean);
        den += (xs[i] - xMean) ** 2;
      }
      const slope = den === 0 ? 0 : num / den;
      const intercept = yMean - slope * xMean;
      for (let k = 1; k <= 3; k++) {
        const nextIndex = n - 1 + k;
        const proj = slope * nextIndex + intercept;
        const lastMonth = new Date(points[points.length - 1].month + "-01");
        lastMonth.setMonth(lastMonth.getMonth() + k);
        const monthKey = lastMonth.toISOString().slice(0, 7);
        projections.push({ month: monthKey, revenue: Math.max(0, Math.round(proj)) });
      }
    }
    return { series, projections };
  }, [leads]);

  const funnelOrder = ["new", "contacted", "qualified", "customer"];
  const funnelData = funnelOrder.map((s) => ({ name: s, value: byStatus[s] || 0 }));

  const pushNotification = (text) => {
    setNotifications((n) => [{ id: Date.now().toString(), text, time: new Date() }, ...n].slice(0, 40));
  };

  const touchState = useRef({});

  const onRowTouchStart = (e, id) => {
    const touch = e.touches ? e.touches[0] : e;
    touchState.current[id] = { startX: touch.clientX, startY: touch.clientY, moved: false, startTime: Date.now() };
    touchState.current[id].longPressTimer = setTimeout(() => openActionSheet(id), 700);
  };

  const onRowTouchMove = (e, id) => {
    const t = e.touches ? e.touches[0] : e;
    const state = touchState.current[id];
    if (!state) return;
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;
    if (Math.abs(dx) > 12) state.moved = true;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) clearTimeout(state.longPressTimer);
    state.deltaX = dx;
  };

  const onRowTouchEnd = async (e, lead) => {
    const id = lead.id;
    const state = touchState.current[id];
    if (!state) return;
    clearTimeout(state.longPressTimer);
    const dx = state.deltaX || 0;
    if (dx < -80) {
      if (confirm(`Delete lead ${lead.name || lead.full_name || "Untitled"}?`)) {
        try {
          await api.deleteLead(id);
          setLeads((p) => p.filter((x) => x.id !== id));
          pushNotification(`Lead ${lead.name || lead.full_name || "Untitled"} deleted`);
        } catch (e) {
          alert("Delete failed");
          await fetch();
        }
      }
    } else if (!state.moved && Date.now() - state.startTime < 300) {
      openActionSheet(id);
    }
    delete touchState.current[id];
  };

  const [actionSheet, setActionSheet] = useState({ open: false, leadId: null });
  const openActionSheet = (id) => setActionSheet({ open: true, leadId: id });
  const closeActionSheet = () => setActionSheet({ open: false, leadId: null });

  const performAction = async (action) => {
    const id = actionSheet.leadId;
    const lead = leads.find((l) => l.id === id);
    if (!lead) return closeActionSheet();
    if (action === "delete") {
      if (confirm(`Delete lead ${lead.name || lead.full_name || "Untitled"}?`)) {
        try {
          await api.deleteLead(id);
          setLeads((p) => p.filter((x) => x.id !== lead.id));
          pushNotification(`Lead ${lead.name || lead.full_name || "Untitled"} deleted`);
        } catch (e) {
          alert("Delete failed");
          await fetch();
        }
      }
    }
    if (action === "quick") {
      const nextStatus = normalizeStatus(lead.status) === "new" ? "contacted" : "customer";
      setLeads((prev) => prev.map((p) => (p.id === lead.id ? { ...p, status: nextStatus } : p)));
      try {
        await api.updateLeadStatus(lead.id, nextStatus);
      } catch (e) {
        await fetch();
      }
    }
    closeActionSheet();
  };

  const onTouchStartOuter = (e) => {
    const t = e.touches ? e.touches[0] : e;
    touchStartY.current = t.clientY;
    pullDistance.current = 0;
  };
  const onTouchMoveOuter = (e) => {
    const t = e.touches ? e.touches[0] : e;
    pullDistance.current = t.clientY - touchStartY.current;
    if (pullRef.current && pullRef.current.scrollTop <= 0 && pullDistance.current > 60) {
      fetch();
      touchStartY.current = t.clientY;
    }
  };

  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef(null);
  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-lead-idx='${focusIndex}']`);
      if (el) el.focus();
    }
  }, [focusIndex, filtered.length]);

  const onListKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Delete") {
      const lead = filtered[focusIndex];
      if (lead && confirm(`Delete lead ${lead.name || lead.full_name || "Untitled"}?`)) {
        api.deleteLead(lead.id).then(() => setLeads((p) => p.filter((x) => x.id !== lead.id))).catch(() => fetch());
      }
    }
    if (e.key === "Enter") {
      const lead = filtered[focusIndex];
      if (lead) openActionSheet(lead.id);
    }
    if (e.key === " ") {
      const lead = filtered[focusIndex];
      if (lead) {
        e.preventDefault();
        const nextStatus = normalizeStatus(lead.status) === "new" ? "contacted" : "customer";
        setLeads((prev) => prev.map((p) => (p.id === lead.id ? { ...p, status: nextStatus } : p)));
        api.updateLeadStatus(lead.id, nextStatus).catch(() => fetch());
      }
    }
  };

  const leadAriaLabel = (lead) =>
    `${lead.name || lead.full_name || "Untitled"}, ${lead.company || "no company"}, status ${lead.status}`;

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  return (
    <div>
      <div className="space-y-6 p-4 sm:p-6 bg-gradient-to-b from-[#fbfdfd] to-[#eef6ff] min-h-screen text-[#0f172a]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[#0f172a]">Leads Dashboard</h2>
            <p className="text-sm text-[#6b7280]">Overview of your leads — pastel office view</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-sm text-[#6b7280]">
              <div>Updated</div>
              <div className="font-medium">{lastUpdated ? fmt(lastUpdated) : "—"}</div>
            </div>

            <button
              onClick={fetch}
              className="px-3 py-2 rounded border bg-gradient-to-r from-[#d6fff4] to-[#7dd3fc] text-[#042022] text-sm font-semibold"
              aria-label="Refresh"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl shadow col-span-1 sm:col-span-1 md:col-span-2 bg-white/95 border border-[#eef2f7]"
          >
            <p className="text-sm text-[#6b7280]">Total Leads</p>
            <div className="flex items-center justify-between">
              <h3 className="text-2xl sm:text-3xl font-bold text-[#0f172a]">{total}</h3>
              <div className="text-xs text-[#9ca3af]">live</div>
            </div>
            <p className="mt-2 text-sm text-[#9ca3af]">Leads captured across all sources</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl shadow col-span-1 bg-white/95 border border-[#eef2f7]"
          >
            <p className="text-sm text-[#6b7280]">Conversion Snapshot</p>
            <h3 className="text-2xl font-semibold mt-1 text-[#0f172a]">
              {((byStatus.customer || 0) / Math.max(1, total) * 100).toFixed(1)}%
            </h3>
            <p className="mt-2 text-sm text-[#9ca3af]">Customers / Total leads</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl shadow col-span-1 bg-white/95 border border-[#eef2f7]"
          >
            <p className="text-sm text-[#6b7280]">Active Statuses</p>
            <div className="mt-2 flex gap-2 flex-wrap">
              {Object.entries(byStatus).map(([s, c]) => (
                <div
                  key={s}
                  className="flex items-center gap-2 px-3 py-1 rounded-full"
                  style={{ background: "rgba(240, 249, 255, 0.6)" }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: colorForStatus(s) }} />
                  <div className="text-sm">
                    <div className="font-medium text-[#0f172a]">{cap(s)}</div>
                    <div className="text-xs text-[#9ca3af]">{c}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl shadow col-span-1 bg-white/95 border border-[#eef2f7]"
          >
            <p className="text-sm text-[#6b7280]">Recent Trend</p>
            <div style={{ height: 64 }} className="mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -10, right: -10 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#c7b8ff" stopOpacity={0.95} />
                    </linearGradient>
                  </defs>
                  <Line type="monotone" dataKey="count" stroke="url(#trendGrad)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-[#9ca3af]">
              Leads by day (last {Math.min(30, trend.length)} days shown)
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl shadow col-span-1 bg-white/95 border border-[#eef2f7]"
          >
            <p className="text-sm text-[#6b7280]">Revenue (last months)</p>
            <div className="text-lg font-medium mt-2 text-[#0f172a]">
              {revenueSeries.series.reduce((s, x) => s + x.revenue, 0)}
            </div>
            <p className="mt-2 text-sm text-[#9ca3af]">Sum of recorded revenue</p>
          </motion.div>
        </div>

        {/* Main area */}
        <div
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          onTouchStart={onTouchStartOuter}
          onTouchMove={onTouchMoveOuter}
          ref={pullRef}
        >
          <div className="col-span-1 lg:col-span-2 p-4 rounded-xl shadow bg-white/95 border border-[#eef2f7]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, company or phone"
                  className="w-full sm:w-96 px-3 py-2 rounded border text-sm bg-white"
                  aria-label="Search leads"
                />

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded border text-sm bg-white"
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  {Object.keys(byStatus).map((s) => (
                    <option key={s} value={s}>
                      {cap(s)}
                    </option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 rounded border text-sm bg-white"
                  aria-label="Sort leads"
                >
                  <option value="recent">Most Recent</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>

              <div className="text-sm text-[#6b7280]">
                Showing <strong className="text-[#0f172a]">{filtered.length}</strong> of {total}
              </div>
            </div>

            <div
              className="mt-4 space-y-3 max-h-[46vh] sm:max-h-[56vh] overflow-auto pr-2"
              ref={listRef}
              tabIndex={0}
              onKeyDown={onListKeyDown}
              aria-label="Leads list"
              role="list"
            >
              {filtered.map((lead, idx) => (
                <motion.div
                  key={lead.id}
                  data-lead-idx={idx}
                  tabIndex={-1}
                  role="listitem"
                  aria-label={leadAriaLabel(lead)}
                  onTouchStart={(e) => onRowTouchStart(e, lead.id)}
                  onTouchMove={(e) => onRowTouchMove(e, lead.id)}
                  onTouchEnd={(e) => onRowTouchEnd(e, lead)}
                  onMouseDown={(e) => onRowTouchStart(e, lead.id)}
                  onMouseMove={(e) => onRowTouchMove(e, lead.id)}
                  onMouseUp={(e) => onRowTouchEnd(e, lead)}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="p-3 rounded-lg flex items-start justify-between gap-4 bg-[#fbfdff] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#c7b8ff]"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#eef6ff] shadow flex items-center justify-center text-sm sm:text-lg font-semibold text-[#0f172a]">
                      {((lead.name || lead.full_name || "").slice(0, 2) || "").toUpperCase()}
                    </div>

                    <div>
                      <div className="font-medium text-[#0f172a]">{lead.name || lead.full_name || "Untitled"}</div>
                      <div className="text-xs text-[#6b7280]">{lead.company || "—"} • {lead.email || "—"}</div>
                      <div className="text-xs text-[#9ca3af] mt-1">{fmt(lead.created_at)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-[#0f172a]">{cap(normalizeStatus(lead.status))}</div>
                      <div className="text-xs text-[#9ca3af]">{lead.source || "—"}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const nextStatus = normalizeStatus(lead.status) === "new" ? "contacted" : "customer";
                          setLeads((prev) => prev.map((p) => (p.id === lead.id ? { ...p, status: nextStatus } : p)));
                          try {
                            await api.updateLeadStatus(lead.id, nextStatus);
                          } catch (e) {
                            await fetch();
                          }
                        }}
                        className="px-3 py-1 text-sm rounded border bg-white text-[#0f172a]"
                        aria-label={`Quick move ${lead.name || lead.full_name}`}
                        style={{ borderColor: "#e6eef7" }}
                      >
                        Quick Move
                      </button>

                      <button
                        onClick={async () => {
                          if (!confirm("Delete this lead?")) return;
                          try {
                            await api.deleteLead(lead.id);
                            setLeads((p) => p.filter((x) => x.id !== lead.id));
                            pushNotification(`Lead ${lead.name || lead.full_name || "Untitled"} deleted`);
                          } catch (e) {
                            alert("Delete failed");
                            await fetch();
                          }
                        }}
                        className="px-3 py-1 text-sm rounded border text-[#fb7185] bg-white"
                        aria-label={`Delete ${lead.name || lead.full_name}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center text-sm text-[#9ca3af] py-8">No leads match your filters</div>
              )}
            </div>
          </div>

          {/* Right column / widgets */}
          <aside className="p-4 rounded-xl shadow space-y-4 bg-white/95 border border-[#eef2f7]">
            <div className="p-3 rounded" style={{ background: "linear-gradient(180deg,#f6f2ff,#fff)", borderRadius: 8 }}>
              <p className="text-sm text-[#6b7280]">Status Distribution</p>
              <div style={{ height: 160 }} className="mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie dataKey="value" data={pieData} outerRadius={56} innerRadius={24} paddingAngle={4} labelLine={false}>
                      {pieData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={colorForStatus(entry.name)} />
                      ))}
                    </Pie>
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-3 rounded" style={{ background: "linear-gradient(180deg,#ecfffb,#fff)", borderRadius: 8 }}>
              <p className="text-sm text-[#6b7280]">Conversion Funnel</p>
              <div style={{ height: 120 }} className="mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: -30 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={80} tickFormatter={cap} />
                    <Bar dataKey="value" radius={[6, 6, 6, 6]}>
                      {funnelData.map((entry, i) => (
                        <Cell key={`f-${i}`} fill={colorForStatus(entry.name)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-3 rounded" style={{ background: "linear-gradient(180deg,#fff,#fff)", borderRadius: 8 }}>
              <p className="text-sm text-[#6b7280]">Notifications</p>
              <div className="mt-2 max-h-36 overflow-auto">
                {notifications.length === 0 && <div className="text-xs text-[#9ca3af]">No notifications</div>}
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-2 py-2 border-b last:border-b-0">
                    <div className="w-2 h-2 rounded-full mt-1" style={{ background: "#7dd3fc" }} />
                    <div className="text-sm">
                      <div className="font-medium text-[#0f172a]">{n.text}</div>
                      <div className="text-xs text-[#9ca3af]">{new Date(n.time).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setNotifications([])} className="px-3 py-1 text-sm rounded border bg-white">
                  Clear
                </button>
                <button onClick={() => pushNotification("Manual ping")} className="px-3 py-1 text-sm rounded border bg-white">
                  Ping
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
          <div className="p-4 rounded-xl shadow bg-white/95 border border-[#eef2f7]">
            <p className="text-sm text-[#6b7280]">Activity Heatmap (last 90 days)</p>
            <div className="mt-3">
              <ActivityHeatmap data={heatmapData} cellSize={14} />
            </div>
          </div>

          <div className="p-4 rounded-xl shadow bg-white/95 border border-[#eef2f7]">
            <p className="text-sm text-[#6b7280]">Revenue Forecast</p>
            <div style={{ height: 180 }} className="mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[...revenueSeries.series, ...revenueSeries.projections].map((d) => ({
                    month: d.month,
                    revenue: d.revenue,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <defs>
                    <linearGradient id="revGrad" x1="0" x2="1">
                      <stop offset="0%" stopColor="#c7b8ff" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#7dd3fc" stopOpacity={0.95} />
                    </linearGradient>
                  </defs>
                  <Line type="monotone" dataKey="revenue" stroke="url(#revGrad)" strokeWidth={2} dot={{ r: 2 }} />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-[#9ca3af]">Projected months are included to the right when enough history exists.</div>
          </div>

          <div className="p-4 rounded-xl shadow bg-white/95 border border-[#eef2f7]">
            <p className="text-sm text-[#6b7280]">Team Performance</p>
            <div className="mt-3">
              <div className="space-y-2">
                {leaderboard.slice(0, 6).map((t, idx) => (
                  <div key={t.team} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[#0f172a]">
                        {idx + 1}. {t.team}
                      </div>
                      <div className="text-xs text-[#9ca3af]">Leads: {t.leads} • Customers: {t.customers}</div>
                    </div>
                    <div className="text-sm font-semibold text-[#0f172a]">{t.revenue}</div>
                  </div>
                ))}
                {leaderboard.length === 0 && <div className="text-xs text-[#9ca3af]">No team data</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs text-[#9ca3af]">Tip: search & filters still work. For large datasets use server-side aggregations.</div>

        {/* action sheet */}
        {actionSheet.open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Lead actions"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/20" onClick={closeActionSheet} />
            <div className="relative w-full sm:w-96 bg-white rounded-t-lg sm:rounded-lg p-4 border border-[#eef2f7]">
              <div className="font-medium mb-2 text-[#0f172a]">Actions</div>
              <div className="space-y-2">
                <button
                  className="w-full text-left px-3 py-2 rounded bg-[#7dd3fc] text-[#042022]"
                  onClick={() => performAction("quick")}
                >
                  Quick Move
                </button>
                <button className="w-full text-left px-3 py-2 rounded border text-[#fb7185]" onClick={() => performAction("delete")}>
                  Delete
                </button>
                <button className="w-full text-left px-3 py-2 rounded border" onClick={closeActionSheet}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// small component
function ActivityHeatmap({ data, cellSize = 12 }) {
  if (!data || data.length === 0) return <div className="text-xs text-[#9ca3af]">No activity</div>;
  const cols = Math.ceil(data.length / 7);
  const buckets = Array.from({ length: cols }, (_, c) => data.slice(c * 7, c * 7 + 7));
  const max = data.reduce((m, x) => Math.max(m, x.count || 0), 0) || 1;
  const colorFor = (count) => {
    if (count <= 0) return "#F3F4F6";
    const t = Math.min(1, count / max);
    const start = { r: 199, g: 184, b: 255 };
    const end = { r: 125, g: 211, b: 252 };
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="overflow-auto">
      <div className="flex gap-2">
        {buckets.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, r) => {
              const cell = col[r];
              const count = cell ? cell.count : 0;
              return (
                <div
                  key={r}
                  title={`${cell && cell.day ? cell.day : "empty"}: ${count}`}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background: colorFor(count),
                    borderRadius: 3,
                    boxShadow: count > 0 ? "inset 0 -1px 0 rgba(0,0,0,0.03)" : undefined,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-[#9ca3af]">Darker = more activity</div>
    </div>
  );
}
