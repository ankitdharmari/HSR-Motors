import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../lib/supabase";

// Enhanced LeadManagement component
// - create / edit lead modal
// - bulk select + bulk actions (status change, delete, export)
// - quick inline status edit
// - search, filter, sort, pagination
// - optimistic updates + simple toast

export default function LeadManagement() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", company: "", source: "" });
  const [toast, setToast] = useState(null);
  const PAGE_SIZE = 30;

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
      setToast({ type: "error", text: "Failed to load leads" });
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
          setLeads((prev) => {
            const map = new Map(prev.map((l) => [l.id, l]));
            changed.forEach((c) => map.set(c.id, c));
            return Array.from(map.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
          });
        });
      } catch (e) {}
    }
    return () => unsub && unsub();
  }, []);

  // derived list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((l) => (statusFilter === "all" ? true : l.status === statusFilter))
      .filter((l) => {
        if (!q) return true;
        return (
          (l.full_name || "").toLowerCase().includes(q) ||
          (l.email || "").toLowerCase().includes(q) ||
          (l.phone || "").includes(q) ||
          (l.company || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "recent") return +new Date(b.created_at) - +new Date(a.created_at);
        if (sortBy === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
        if (sortBy === "name") return (a.full_name || "").localeCompare(b.full_name || "");
        return 0;
      });
  }, [leads, query, statusFilter, sortBy]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(new Set(filtered.slice(0, PAGE_SIZE).map((l) => l.id)));
  const clearSelection = () => setSelected(new Set());

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: "", email: "", phone: "", company: "", source: "" });
    setModalOpen(true);
  };

  const openEdit = (lead) => {
    setEditing(lead);
    setForm({ full_name: lead.full_name || "", email: lead.email || "", phone: lead.phone || "", company: lead.company || "", source: lead.source || "" });
    setModalOpen(true);
  };

  const save = async () => {
    const payload = { ...form };
    try {
      if (editing) {
        // optimistic local update
        setLeads((p) => p.map((l) => (l.id === editing.id ? { ...l, ...payload } : l)));
        await api.updateLead(editing.id, payload);
        setToast({ type: "success", text: "Saved" });
      } else {
        const created = await api.createLead(payload);
        setLeads((p) => [created, ...p]);
        setToast({ type: "success", text: "Lead created" });
      }
      setModalOpen(false);
    } catch (e) {
      console.error(e);
      setToast({ type: "error", text: "Save failed" });
      await fetch({ page: 1 });
    }
  };

  const quickChangeStatus = async (id, status) => {
    const prev = leads;
    setLeads((p) => p.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await api.updateLeadStatus(id, status);
    } catch (e) {
      setLeads(prev);
      setToast({ type: "error", text: "Status update failed" });
    }
  };

  const bulkChangeStatus = async (status) => {
    const ids = Array.from(selected);
    if (!ids.length) return setToast({ type: "info", text: "No rows selected" });
    setLeads((p) => p.map((l) => (ids.includes(l.id) ? { ...l, status } : l)));
    clearSelection();
    try {
      await api.bulkUpdateStatus(ids, status);
      setToast({ type: "success", text: "Updated" });
    } catch (e) {
      await fetch({ page: 1 });
      setToast({ type: "error", text: "Bulk update failed" });
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return setToast({ type: "info", text: "No rows selected" });
    if (!confirm(`Delete ${ids.length} leads?`)) return;
    const prev = leads;
    setLeads((p) => p.filter((l) => !ids.includes(l.id)));
    clearSelection();
    try {
      await api.bulkDelete(ids);
      setToast({ type: "success", text: "Deleted" });
    } catch (e) {
      setLeads(prev);
      setToast({ type: "error", text: "Bulk delete failed" });
    }
  };

  const exportCSV = () => {
    const rows = leads.filter((l) => selected.has(l.id));
    if (rows.length === 0) return setToast({ type: "info", text: "Select rows to export" });
    const csv = [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ type: "success", text: "Exported" });
  };

  const loadMore = () => fetch({ page: page + 1 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Lead Management</h2>
        <div className="flex items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, phone" className="px-3 py-2 rounded border" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded border">
            <option value="all">All</option>
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
          <button onClick={openCreate} className="px-3 py-2 rounded bg-blue-600 text-white">New Lead</button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={selectAllVisible} className="px-3 py-1 rounded border text-sm">Select visible</button>
        <button onClick={clearSelection} className="px-3 py-1 rounded border text-sm">Clear</button>
        <button onClick={() => bulkChangeStatus('contacted')} className="px-3 py-1 rounded border text-sm">Mark Contacted</button>
        <button onClick={() => bulkChangeStatus('qualified')} className="px-3 py-1 rounded border text-sm">Mark Qualified</button>
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
          <div className="bg-white p-8 rounded text-center text-gray-500">No leads — add new leads to get started.</div>
        )}

        {!loading && filtered.map((l) => (
          <motion.div key={l.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`bg-white p-4 rounded shadow flex items-center gap-4 ${selected.has(l.id) ? 'ring-2 ring-blue-100' : ''}`}>
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />

            <div className="flex-1">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{l.full_name}</div>
                  <div className="text-xs text-gray-500">{l.email || l.phone || '—'}</div>
                </div>

                <div className="flex items-center gap-2">
                  <select value={l.status} onChange={(e) => quickChangeStatus(l.id, e.target.value)} className="px-2 py-1 rounded border text-sm">
                    <option value="new">new</option>
                    <option value="contacted">contacted</option>
                    <option value="qualified">qualified</option>
                    <option value="customer">customer</option>
                    <option value="lost">lost</option>
                  </select>
                  <button onClick={() => openEdit(l)} className="px-3 py-1 rounded border text-sm">Edit</button>
                </div>
              </div>

              <div className="mt-2 text-xs text-gray-400">Source: {l.source || '—'} • Created: {new Date(l.created_at).toLocaleDateString()}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex justify-center mt-2">
        {hasMore ? (
          <button onClick={loadMore} className="px-4 py-2 rounded border">Load more</button>
        ) : (
          <div className="text-sm text-gray-400">No more leads</div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
          <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl p-6 z-50 w-[640px] shadow-lg">
            <h3 className="text-lg font-semibold">{editing ? 'Edit lead' : 'New lead'}</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input className="px-3 py-2 border rounded" value={form.full_name} onChange={(e) => setForm((s) => ({ ...s, full_name: e.target.value }))} placeholder="Full name" />
              <input className="px-3 py-2 border rounded" value={form.company} onChange={(e) => setForm((s) => ({ ...s, company: e.target.value }))} placeholder="Company" />
              <input className="px-3 py-2 border rounded" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} placeholder="Email" />
              <input className="px-3 py-2 border rounded" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} placeholder="Phone" />
              <input className="px-3 py-2 border rounded col-span-2" value={form.source} onChange={(e) => setForm((s) => ({ ...s, source: e.target.value }))} placeholder="Source (website, referral, etc.)" />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="px-4 py-2 rounded border" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={save}>Save</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className="bg-white p-3 rounded shadow flex items-center gap-3">
            <div className="text-sm">{toast.text}</div>
            <button onClick={() => setToast(null)} className="text-xs text-gray-400">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
