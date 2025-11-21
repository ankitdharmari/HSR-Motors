import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../lib/supabase";

// Enhanced LeadList component
// - debounced search + keyboard shortcut ("/")
// - status filter, sort, and quick actions
// - selectable rows with bulk actions (change status, export, delete)
// - skeleton loading, empty state, and "Load more" pagination
// - optional realtime subscription hook if api supports it

export default function LeadList() {
  const [leads, setLeads] = useState([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef(null);

  const PAGE_SIZE = 20;

  // initial fetch + pagination
  const fetch = async (opts = {}) => {
    setLoading(true);
    try {
      const { page = 1 } = opts;
      const data = await api.fetchLeads({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      const arr = Array.isArray(data) ? data : [];
      if (page === 1) setLeads(arr);
      else setLeads((p) => [...p, ...arr]);
      setHasMore(arr.length === PAGE_SIZE);
      setPage(page);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch({ page: 1 });
    let unsub;
    if (api.onLeadsChange) {
      try {
        unsub = api.onLeadsChange((changed) => {
          // crude merge: replace by id when changed
          setLeads((prev) => {
            const map = new Map(prev.map((l) => [l.id, l]));
            changed.forEach((c) => map.set(c.id, c));
            return Array.from(map.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
          });
        });
      } catch (e) {}
    }
    const onKey = (e) => {
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsub && unsub();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(filtered.slice(0, PAGE_SIZE).map((l) => l.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const bulkChangeStatus = async (newStatus) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    // optimistic update
    setLeads((p) => p.map((l) => (ids.includes(l.id) ? { ...l, status: newStatus } : l)));
    clearSelection();
    try {
      await api.bulkUpdateStatus(ids, newStatus);
    } catch (e) {
      // refresh on error
      fetch({ page: 1 });
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} leads?`)) return;
    const prev = leads;
    setLeads((p) => p.filter((l) => !ids.includes(l.id)));
    clearSelection();
    try {
      await api.bulkDelete(ids);
    } catch (e) {
      setLeads(prev);
      alert("Bulk delete failed");
    }
  };

  const exportCSV = () => {
    const rows = leads.filter((l) => selected.has(l.id));
    if (rows.length === 0) return alert("Select rows to export");
    const csv = [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    return leads
      .filter((l) => {
        if (statusFilter !== "all" && l.status !== statusFilter) return false;
        if (!debouncedQ) return true;
        return (l.full_name || "").toLowerCase().includes(debouncedQ) || (l.phone || "").includes(debouncedQ) || (l.email || "").toLowerCase().includes(debouncedQ);
      })
      .sort((a, b) => {
        if (sortBy === "recent") return +new Date(b.created_at) - +new Date(a.created_at);
        if (sortBy === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
        if (sortBy === "name") return (a.full_name || "").localeCompare(b.full_name || "");
        return 0;
      });
  }, [leads, debouncedQ, statusFilter, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Leads</h2>

        <div className="flex items-center gap-2">
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search (press / to focus)" className="px-3 py-2 rounded border" />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded border">
            <option value="all">All statuses</option>
            <option value="new">new</option>
            <option value="contacted">contacted</option>
            <option value="qualified">qualified</option>
            <option value="customer">customer</option>
            <option value="lost">lost</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-3 py-2 rounded border">
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={selectAllVisible} className="px-3 py-1 rounded border text-sm">Select visible</button>
        <button onClick={clearSelection} className="px-3 py-1 rounded border text-sm">Clear</button>
        <button onClick={() => bulkChangeStatus("contacted")} className="px-3 py-1 rounded border text-sm">Mark Contacted</button>
        <button onClick={() => bulkChangeStatus("qualified")} className="px-3 py-1 rounded border text-sm">Mark Qualified</button>
        <button onClick={bulkDelete} className="px-3 py-1 rounded border text-sm text-red-600">Delete</button>
        <button onClick={exportCSV} className="px-3 py-1 rounded border text-sm">Export CSV</button>
        <div className="ml-auto text-sm text-gray-500">Showing <strong>{filtered.length}</strong> leads</div>
      </div>

      <div className="space-y-2">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white p-4 rounded shadow">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/4" />
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div className="bg-white p-8 rounded text-center text-gray-500">No leads found — try adjusting filters or add new leads.</div>
        )}

        {!loading && filtered.map((lead) => (
          <motion.div key={lead.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`bg-white p-4 rounded shadow flex items-center gap-4 ${selected.has(lead.id) ? "ring-2 ring-blue-100" : ""}`}>
            <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
            <div className="flex-1">
              <Link to={`/leads/${lead.id}`} className="font-medium text-sm hover:underline">{lead.full_name}</Link>
              <div className="text-xs text-gray-500">{lead.email || lead.phone || "—"}</div>
            </div>
            <div className="text-sm text-gray-500">{lead.status}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex justify-center mt-2">
        {hasMore ? (
          <button onClick={() => fetch({ page: page + 1 })} className="px-4 py-2 rounded border">Load more</button>
        ) : (
          <div className="text-sm text-gray-400">No more leads</div>
        )}
      </div>
    </div>
  );
}
