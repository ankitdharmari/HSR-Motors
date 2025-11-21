// src/pages/LeadDetails.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../lib/supabase";

/*
  LeadDetails.jsx — Working version with pastel UI to match Dashboard
  - Defensive API usage (falls back if api.* missing)
  - Optimistic UI updates with rollback on error
  - Normalized fields (name / full_name)
  - Pastel color accents to match Dashboard.jsx
*/

export default function LeadDetails() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [filter, setFilter] = useState("all");
  const [activityQuery, setActivityQuery] = useState("");

  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");

  const [callLogs, setCallLogs] = useState([]);
  const [callStats, setCallStats] = useState({ total: 0, minutes: 0 });
  const [messageDraft, setMessageDraft] = useState("");
  const [templates] = useState([
    "Thanks for your interest. When's a good time to talk?",
    "Your test drive is confirmed. See you soon!",
    "Here is the quote you requested — let me know any questions."
  ]);
  const [sendingMessage, setSendingMessage] = useState(false);

  const [score, setScore] = useState(null);
  const [manualScore, setManualScore] = useState(null);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState("");

  const [nextFollowUp, setNextFollowUp] = useState(null);

  const [duplicates, setDuplicates] = useState([]);
  const [relatedLeads, setRelatedLeads] = useState([]);

  const [collabNotes, setCollabNotes] = useState([]);
  const [collabDraft, setCollabDraft] = useState("");

  const [scripts, setScripts] = useState([]);

  const [previousCar, setPreviousCar] = useState(null);
  const [testDriveDate, setTestDriveDate] = useState("");
  const [testDriveVehicle, setTestDriveVehicle] = useState("");

  const [toast, setToast] = useState(null);

  // show transient toast
  const showToast = (text, type = "info") => {
    setToast({ text, type, id: Date.now() });
    window.setTimeout(() => setToast(null), 3500);
  };

  // Fetch everything needed for the lead details view
  const fetchAll = async () => {
    setLoading(true);
    try {
      // main lead
      const l = await (api.fetchLeadById ? api.fetchLeadById(id) : Promise.resolve(null)).catch(() => null);

      // multiple resources (fall back to [])
      const [
        a,
        h,
        at,
        t,
        cl,
        r,
        dups,
        s,
        tt,
        cn
      ] = await Promise.all([
        (api.fetchActivities ? api.fetchActivities(id) : Promise.resolve([])).catch(() => []),
        (api.fetchStatusHistory ? api.fetchStatusHistory(id) : Promise.resolve([])).catch(() => []),
        (api.fetchAttachments ? api.fetchAttachments(id) : Promise.resolve([])).catch(() => []),
        (api.fetchTasks ? api.fetchTasks(id) : Promise.resolve([])).catch(() => []),
        (api.fetchCallLogs ? api.fetchCallLogs(id) : Promise.resolve([])).catch(() => []),
        (api.fetchRelatedLeads ? api.fetchRelatedLeads(id) : Promise.resolve([])).catch(() => []),
        (api.detectDuplicates ? api.detectDuplicates(id) : Promise.resolve([])).catch(() => []),
        (api.fetchLeadScore ? api.fetchLeadScore(id) : Promise.resolve(null)).catch(() => null),
        (api.fetchCallScripts ? api.fetchCallScripts() : Promise.resolve([])).catch(() => []),
        (api.fetchCollabNotes ? api.fetchCollabNotes(id) : Promise.resolve([])).catch(() => []),
      ]);

      // set state defensively
      setLead(l || null);
      setActivities(Array.isArray(a) ? a : []);
      setHistory(Array.isArray(h) ? h : []);
      setAttachments(Array.isArray(at) ? at : []);
      setTasks(Array.isArray(t) ? t : []);
      setCallLogs(Array.isArray(cl) ? cl : []);
      setRelatedLeads(Array.isArray(r) ? r : []);
      setDuplicates(Array.isArray(dups) ? dups : []);
      setScore(s ?? null);
      setScripts(Array.isArray(tt) ? tt : []);
      setCollabNotes(Array.isArray(cn) ? cn : []);

      // tags parsing (support array or comma string)
      const parsedTags = l && (l.tags || l.tags_list || l.tagString)
        ? (Array.isArray(l.tags) ? l.tags : (l.tags_list || String(l.tagString || "")).split?.(",").map(s => s.trim()).filter(Boolean))
        : [];
      setTags(parsedTags);

      // next follow-up detection
      setNextFollowUp(l && (l.next_follow_up || l.nextFollowUp) ? (l.next_follow_up || l.nextFollowUp) : null);

      // call stats (total & minutes)
      const totalCalls = (cl || []).length;
      const minutes = Math.round((cl || []).reduce((s, c) => s + (Number(c.duration || 0) / 60), 0));
      setCallStats({ total: totalCalls, minutes });

      // previous car
      setPreviousCar(l && (l.previous_car || l.prev_car) ? (l.previous_car || l.prev_car) : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    let unsub;
    if (api.onLeadChange) {
      try {
        unsub = api.onLeadChange(id, (updated) => {
          // merge safely
          setLead((prev) => ({ ...(prev || {}), ...(updated || {}) }));
        });
      } catch (e) {
        /* ignore */
      }
    }
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // small helpers
  const fmt = (d) => (d ? new Date(d).toLocaleString() : "-");
  const nameFor = (l) => (l?.full_name || l?.name || "Untitled");
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // derived filtered activities
  const filteredActivities = useMemo(() => {
    const q = activityQuery.trim().toLowerCase();
    return activities
      .filter((a) => (filter === "all" ? true : (a.type || "").toLowerCase() === filter))
      .filter((a) => !q || (a.note || "").toLowerCase().includes(q) || (a.outcome || "").toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [activities, filter, activityQuery]);

  // status change with optimistic UI + history refresh
  const statusOptions = ["new", "contacted", "qualified", "customer", "lost"];
  const changeStatus = async (next) => {
    if (!lead) return;
    if (next === lead.status) return;
    const prev = lead.status;
    setLead((s) => ({ ...s, status: next }));
    try {
      if (api.updateLeadStatus) await api.updateLeadStatus(lead.id, next);
      // optimistic history push then refresh from server
      setHistory((h) => [{ id: `hist-${Date.now()}`, previous_status: prev, new_status: next, changed_at: new Date().toISOString(), by: "you" }, ...h]);
      if (api.fetchStatusHistory) {
        const hNew = await api.fetchStatusHistory(lead.id).catch(() => null);
        setHistory(Array.isArray(hNew) ? hNew : (history || []));
      }
      showToast("Status updated", "success");
    } catch (e) {
      setLead((s) => ({ ...s, status: prev }));
      showToast("Failed to change status", "error");
    }
  };

  // Activities: add, delete
  const addActivity = async (type = "note", payload = {}) => {
    const note = (payload.note ?? newNote ?? "").trim();
    if (!note && type === "note") return showToast("Note is empty");
    const temp = {
      id: `tmp-${Date.now()}`,
      type,
      note,
      outcome: payload.outcome || "",
      created_at: new Date().toISOString(),
      author: payload.author || "you",
    };
    setActivities((p) => [temp, ...p]);
    setNewNote("");
    try {
      const saved = api.createActivity ? await api.createActivity(lead.id, { type, ...payload, note }) : temp;
      // saved might be returned as object, ensure id preserved
      setActivities((p) => p.map((a) => (a.id === temp.id ? (saved || temp) : a)));
      showToast("Activity added", "success");
    } catch (e) {
      setActivities((p) => p.filter((a) => a.id !== temp.id));
      showToast("Failed to add activity", "error");
    }
  };

  const deleteActivity = async (activityId) => {
    if (!confirm("Delete this activity?")) return;
    const prev = activities;
    setActivities((p) => p.filter((a) => a.id !== activityId));
    try {
      if (api.deleteActivity) await api.deleteActivity(activityId);
      showToast("Activity deleted", "success");
    } catch (e) {
      setActivities(prev);
      showToast("Delete failed", "error");
    }
  };

  // Attachments upload / remove
  const onPickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) uploadFiles(files);
    if (fileRef.current) fileRef.current.value = null;
  };

  const uploadFiles = async (files) => {
    setUploading(true);
    const temps = files.map((f, i) => ({
      id: `tmp-att-${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      uploaded_at: new Date().toISOString(),
      url: null,
      mime: f.type
    }));
    setAttachments((p) => [...temps, ...p]);
    try {
      const saved = api.uploadAttachment ? await Promise.all(files.map((f) => api.uploadAttachment(lead.id, f))) : temps;
      // saved should be array of attachments
      setAttachments((p) => {
        const rest = p.filter((x) => !String(x.id).startsWith("tmp-att-"));
        return [...(Array.isArray(saved) ? saved : [saved]), ...rest];
      });
      showToast("Upload complete", "success");
    } catch (e) {
      setAttachments((p) => p.filter((a) => !String(a.id).startsWith("tmp-att-")));
      showToast("Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (attId) => {
    if (!confirm("Delete this file?")) return;
    const prev = attachments;
    setAttachments((p) => p.filter((a) => a.id !== attId));
    try {
      if (api.deleteAttachment) await api.deleteAttachment(attId);
      showToast("File deleted", "success");
    } catch (e) {
      setAttachments(prev);
      showToast("Delete failed", "error");
    }
  };

  // Tasks: add / toggle / delete
  const addTask = async () => {
    const title = (newTaskTitle || "").trim();
    if (!title) return showToast("Task title required");
    const temp = { id: `tmp-task-${Date.now()}`, title, due_at: newTaskDate || null, completed: false, created_at: new Date().toISOString() };
    setTasks((p) => [temp, ...p]);
    setNewTaskTitle("");
    setNewTaskDate("");
    try {
      const saved = api.createTask ? await api.createTask(lead.id, { title, due_at: temp.due_at }) : temp;
      setTasks((p) => p.map((t) => (t.id === temp.id ? (saved || temp) : t)));
      showToast("Task added", "success");
    } catch (e) {
      setTasks((p) => p.filter((t) => t.id !== temp.id));
      showToast("Failed to add task", "error");
    }
  };

  const toggleTask = async (taskId) => {
    const prev = tasks;
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
    try {
      if (api.toggleTaskComplete) await api.toggleTaskComplete(taskId);
      showToast("Task updated", "success");
    } catch (e) {
      setTasks(prev);
      showToast("Update failed", "error");
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm("Delete this task?")) return;
    const prev = tasks;
    setTasks((p) => p.filter((t) => t.id !== taskId));
    try {
      if (api.deleteTask) await api.deleteTask(taskId);
      showToast("Task deleted", "success");
    } catch (e) {
      setTasks(prev);
      showToast("Delete failed", "error");
    }
  };

  // Communications: send message (sms / whatsapp / email)
  const sendMessage = async (channel = "sms") => {
    const text = (messageDraft || "").trim();
    if (!text) return showToast("Message empty");
    setSendingMessage(true);
    try {
      if (api.sendMessage) await api.sendMessage({ leadId: lead.id, text, channel });
      const msg = { id: `msg-${Date.now()}`, type: "message", note: text, channel, created_at: new Date().toISOString(), author: "you" };
      setActivities((p) => [msg, ...p]);
      setMessageDraft("");
      showToast("Message sent", "success");
    } catch (e) {
      showToast("Send failed", "error");
    } finally {
      setSendingMessage(false);
    }
  };

  // call log action (optimistic)
  const logCall = async (outcome = "no_response", duration = 0) => {
    const entry = { id: `call-${Date.now()}`, leadId: lead.id, created_at: new Date().toISOString(), outcome, duration };
    setCallLogs((p) => [entry, ...p]);
    setCallStats((s) => ({ total: s.total + 1, minutes: s.minutes + Math.round(duration / 60) }));
    try {
      if (api.logCall) await api.logCall(lead.id, entry);
      showToast("Call logged", "success");
    } catch (e) {
      showToast("Call log failed", "error");
    }
  };

  // tags
  const addTag = async (t) => {
    const tag = (t || newTag || "").trim();
    if (!tag) return;
    if (tags.includes(tag)) {
      setNewTag("");
      return;
    }
    setTags((p) => [tag, ...p]);
    setNewTag("");
    try {
      if (api.addTag) await api.addTag(lead.id, tag);
    } catch (e) {
      showToast("Tag save failed", "error");
    }
  };

  const removeTag = async (t) => {
    setTags((p) => p.filter((x) => x !== t));
    try {
      if (api.removeTag) await api.removeTag(lead.id, t);
    } catch (e) {
      showToast("Remove tag failed", "error");
    }
  };

  // follow-ups
  const saveFollowUp = async (when, type = "call") => {
    setNextFollowUp(when);
    try {
      if (api.createFollowUp) await api.createFollowUp(lead.id, { when, type });
      showToast("Follow-up set", "success");
    } catch (e) {
      showToast("Follow-up save failed", "error");
    }
  };

  const snoozeFollowUp = async (mins = 60) => {
    if (!nextFollowUp) return showToast("No follow-up to snooze");
    const newWhen = new Date(new Date(nextFollowUp).getTime() + mins * 60000).toISOString();
    await saveFollowUp(newWhen);
  };

  // duplicates
  const mergeDuplicate = async (dupId) => {
    if (!confirm("Merge these leads?")) return;
    try {
      if (api.mergeLeads) await api.mergeLeads(lead.id, dupId);
      showToast("Leads merged", "success");
      fetchAll();
    } catch (e) {
      showToast("Merge failed", "error");
    }
  };

  // collaboration notes
  const addCollabNote = async () => {
    const text = (collabDraft || "").trim();
    if (!text) return;
    const tmp = { id: `tmp-c-${Date.now()}`, text, author: "you", created_at: new Date().toISOString() };
    setCollabNotes((p) => [tmp, ...p]);
    setCollabDraft("");
    try {
      if (api.createCollabNote) await api.createCollabNote(lead.id, text);
      showToast("Note added", "success");
    } catch (e) {
      showToast("Save failed", "error");
    }
  };

  // test drive scheduling
  const scheduleTestDrive = async () => {
    if (!testDriveDate) return showToast("Pick a date/time");
    const payload = { date: testDriveDate, vehicle: testDriveVehicle };
    try {
      if (api.scheduleTestDrive) await api.scheduleTestDrive(lead.id, payload);
      showToast("Test drive scheduled", "success");
      setTestDriveDate("");
      setTestDriveVehicle("");
      setActivities((p) => [{ id: `td-${Date.now()}`, type: "testdrive", note: `Test drive scheduled: ${payload.date}`, created_at: new Date().toISOString() }, ...p]);
    } catch (e) {
      showToast("Schedule failed", "error");
    }
  };

  // map source (uses lead.address or full name)
  const mapSrc = useMemo(() => {
    if (!lead) return "";
    if (lead.latitude && lead.longitude) {
      return `https://www.google.com/maps?q=${lead.latitude},${lead.longitude}&z=15&output=embed`;
    }
    const q = encodeURIComponent(lead.address || `${nameFor(lead)} ${lead.city || ""}`);
    return `https://www.google.com/maps?q=${q}&z=15&output=embed`;
  }, [lead]);

  // combined timeline (activities + attachments + tasks)
  const timeline = useMemo(() => {
    const merged = [
      ...activities.map((a) => ({ kind: "activity", ts: new Date(a.created_at || a.timestamp || Date.now()).getTime(), payload: a })),
      ...attachments.map((at) => ({ kind: "attachment", ts: new Date(at.uploaded_at || at.created_at || Date.now()).getTime(), payload: at })),
      ...tasks.map((t) => ({ kind: "task", ts: new Date(t.created_at || t.due_at || Date.now()).getTime(), payload: t })),
    ];
    return merged.sort((a, b) => b.ts - a.ts);
  }, [activities, attachments, tasks]);

  if (loading) return <div className="p-6">Loading lead details…</div>;
  if (!lead) return <div className="text-center py-10">Lead not found</div>;

  // Render
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-4 bg-gradient-to-b from-[#fbfdfd] to-[#eef6ff] min-h-screen text-[#0f172a]">
      {/* Main column */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow flex items-start justify-between gap-4 border border-[#eef2f7]">
          <div>
            <h2 className="text-2xl font-semibold">{nameFor(lead)}</h2>
            <div className="text-sm text-[#6b7280]">{lead.title || ""} • {lead.company || ""}</div>
            <div className="mt-2 text-xs text-[#9ca3af]">Created: {fmt(lead.created_at)}</div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="text-xs text-[#6b7280]">Lead Score</div>
                <div className="text-lg font-semibold">
                  {manualScore !== null ? manualScore : (score !== null ? score : "—")}
                  {typeof (manualScore ?? score) === "number" ? "/100" : ""}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  className="px-2 py-1 border rounded w-20 text-sm"
                  placeholder="manual"
                  value={manualScore ?? ""}
                  onChange={(e) => setManualScore(e.target.value === "" ? null : Number(e.target.value))}
                />
                <button
                  className="px-3 py-1 rounded bg-gradient-to-r from-[#d6fff4] to-[#7dd3fc] text-[#042022] text-sm"
                  onClick={() => { setManualScore(null); showToast("Manual score reset"); }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* tags */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {tags.map((t) => (
                <div key={t} className="bg-white/80 px-2 py-1 rounded-full text-sm flex items-center gap-2 border border-[#eef2f7]">
                  <span className="text-[#0f172a]">{t}</span>
                  <button onClick={() => removeTag(t)} className="text-xs text-[#fb7185]">✕</button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add tag" className="px-2 py-1 border rounded text-sm" />
                <button onClick={() => addTag()} className="px-2 py-1 rounded bg-white border text-sm">Add</button>
              </div>
            </div>
          </div>

          <div className="w-48 text-right">
            <div className="text-sm text-[#6b7280]">Status</div>
            <select value={lead.status || "new"} onChange={(e) => changeStatus(e.target.value)} className="px-3 py-2 rounded border text-sm w-full">
              {statusOptions.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
            </select>

            <div className="mt-4 text-sm text-[#6b7280]">Next follow-up</div>
            <div className="mt-1">{nextFollowUp ? new Date(nextFollowUp).toLocaleString() : "No follow-up"}</div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => { const t = new Date(); t.setDate(t.getDate() + 1); saveFollowUp(t.toISOString()); }} className="px-2 py-1 rounded bg-white border text-sm">Tomorrow</button>
              <button onClick={() => snoozeFollowUp(60)} className="px-2 py-1 rounded bg-white border text-sm">Snooze 1h</button>
            </div>
          </div>
        </div>

        {/* Customer needs + source */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow col-span-2 border border-[#eef2f7]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Customer Needs Summary</h3>
              <div className="text-xs text-[#9ca3af]">Quick summary</div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[#0f172a]">
              <div>
                <div className="text-xs text-[#6b7280]">Preferred model</div>
                <div className="font-medium">{lead.preferred_model || lead.interest || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[#6b7280]">Budget</div>
                <div className="font-medium">{lead.budget || lead.price_range || lead.budget_range || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[#6b7280]">Timeline</div>
                <div className="font-medium">{lead.purchase_timeline || lead.timeline || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[#6b7280]">Finance needed</div>
                <div className="font-medium">{lead.finance_required ? "Yes" : "No"}</div>
              </div>
              <div>
                <div className="text-xs text-[#6b7280]">Urgency</div>
                <div className="font-medium">{lead.urgency || "—"}</div>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
            <h3 className="font-semibold">Source Insights</h3>
            <div className="mt-3 text-sm text-[#0f172a]">
              <div><strong>Source:</strong> {lead.source || "—"}</div>
              {lead.campaign && <div><strong>Campaign:</strong> {lead.campaign}</div>}
              {typeof lead.cpl !== "undefined" && <div><strong>Cost / lead:</strong> {lead.cpl}</div>}
              {lead.keyword && <div><strong>Keyword:</strong> {lead.keyword}</div>}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Timeline</h3>
            <div className="flex items-center gap-2">
              <input value={activityQuery} onChange={(e) => setActivityQuery(e.target.value)} placeholder="Search timeline..." className="px-3 py-2 rounded border text-sm" />
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 rounded border text-sm">
                <option value="all">All</option>
                <option value="note">Notes</option>
                <option value="call">Calls</option>
                <option value="email">Emails</option>
                <option value="testdrive">Test drives</option>
              </select>
            </div>
          </div>

          <div className="mt-3 space-y-3 max-h-[48vh] overflow-auto pr-2">
            <div className="flex gap-2">
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a quick note..." className="flex-1 px-3 py-2 rounded border text-sm" />
              <button onClick={() => addActivity('note')} className="px-4 py-2 rounded bg-gradient-to-r from-[#d6fff4] to-[#7dd3fc] text-[#042022] text-sm">Add</button>
            </div>

            {timeline.map((item, i) => {
              const p = item.payload;
              return (
                <motion.div key={`${item.kind}-${p.id}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 items-start">
                  <div className="w-3 flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-[#c7b8ff] mt-2" />
                    <div className="w-px flex-1 bg-[#eef2f7] mt-1" />
                  </div>
                  <div className="flex-1 bg-[#fbfdff] p-3 rounded border border-[#eef2f7]">
                    {item.kind === 'activity' && (
                      <>
                        <div className="text-sm font-medium">{cap(p.type || "note")} — {p.author || ''}</div>
                        <div className="text-xs text-[#6b7280] mt-1">{p.note}</div>
                        <div className="text-xs text-[#9ca3af] mt-2">{fmt(p.created_at)} {p.outcome ? `• ${p.outcome}` : ''}</div>
                        <div className="mt-2 text-xs flex gap-2">
                          <button onClick={() => deleteActivity(p.id)} className="text-[#fb7185]">Delete</button>
                        </div>
                      </>
                    )}

                    {item.kind === 'attachment' && (
                      <>
                        <div className="text-sm font-medium">Attachment — {p.name}</div>
                        <div className="text-xs text-[#9ca3af] mt-1">Uploaded: {fmt(p.uploaded_at)}</div>
                        <div className="mt-2 flex gap-2 text-xs">
                          {p.url ? (<a href={p.url} target="_blank" rel="noreferrer" className="underline text-[#0f172a]">View</a>) : (<span className="text-[#9ca3af]">Processing...</span>)}
                          <button onClick={() => removeAttachment(p.id)} className="text-[#fb7185]">Delete</button>
                        </div>
                      </>
                    )}

                    {item.kind === 'task' && (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`text-sm font-medium ${p.completed ? 'line-through text-[#9ca3af]' : ''}`}>{p.title}</div>
                            <div className="text-xs text-[#9ca3af]">{p.due_at ? `Due: ${new Date(p.due_at).toLocaleString()}` : `Created: ${fmt(p.created_at)}`}</div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button onClick={() => toggleTask(p.id)} className="text-sm border px-2 py-1 rounded bg-white">{p.completed ? 'Undo' : 'Done'}</button>
                            <button onClick={() => deleteTask(p.id)} className="text-xs text-[#fb7185]">Delete</button>
                          </div>
                        </div>
                      </>
                    )}

                    {item.kind === 'testdrive' && (
                      <>
                        <div className="text-sm font-medium">Test Drive Scheduled</div>
                        <div className="text-xs text-[#9ca3af] mt-1">{p.note}</div>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {timeline.length === 0 && <div className="text-center text-sm text-[#9ca3af] py-6">No timeline items</div>}
          </div>
        </div>

        {/* Attachments */}
        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Attachments & Documents</h3>
            <div className="text-xs text-[#9ca3af]">Upload photos, invoices, driving license, RC, Aadhar</div>
          </div>

          <div className="mt-3">
            <input ref={fileRef} type="file" multiple onChange={onPickFiles} className="text-sm" />
            <div className="mt-3 space-y-2">
              {attachments.map((at) => (
                <div key={at.id} className="flex items-center justify-between bg-[#fbfdff] p-2 rounded border border-[#eef2f7]">
                  <div className="text-sm">
                    {at.name || at.title}
                    <div className="text-xs text-[#9ca3af]">{at.mime || ''} • {at.size ? `${Math.round(at.size/1024)} KB` : ''}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    {at.url && (<a href={at.url} target="_blank" rel="noreferrer" className="text-sm underline text-[#0f172a]">Open</a>)}
                    <button onClick={() => removeAttachment(at.id)} className="text-[#fb7185] text-sm">Delete</button>
                  </div>
                </div>
              ))}

              {attachments.length === 0 && <div className="text-sm text-[#9ca3af]">No files uploaded</div>}
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Tasks & Reminders</h3>
            <div className="text-xs text-[#9ca3af]">Create call / follow-up tasks</div>
          </div>

          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Task title (eg. Call tomorrow)" className="flex-1 px-3 py-2 rounded border text-sm" />
              <input value={newTaskDate} onChange={(e) => setNewTaskDate(e.target.value)} type="datetime-local" className="px-3 py-2 rounded border text-sm" />
              <button onClick={addTask} className="px-4 py-2 rounded bg-gradient-to-r from-[#d6fff4] to-[#7dd3fc] text-[#042022] text-sm">Add</button>
            </div>

            <div className="flex gap-2 text-sm">
              <button onClick={() => { setNewTaskTitle('Call tomorrow'); const t = new Date(); t.setDate(t.getDate()+1); t.setHours(9,0,0,0); setNewTaskDate(t.toISOString().slice(0,16)); }} className="px-3 py-2 rounded bg-white border">Call tomorrow</button>
              <button onClick={() => { setNewTaskTitle('Send quotation'); setNewTaskDate(''); }} className="px-3 py-2 rounded bg-white border">Send quotation</button>
              <button onClick={() => { setNewTaskTitle('Follow-up after test drive'); setNewTaskDate(''); }} className="px-3 py-2 rounded bg-white border">Follow-up after test drive</button>
            </div>

            <div className="mt-2 space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between bg-[#fbfdff] p-2 rounded border border-[#eef2f7]">
                  <div>
                    <div className={`${t.completed ? 'line-through text-[#9ca3af]' : ''}`}>{t.title}</div>
                    <div className="text-xs text-[#9ca3af]">{t.due_at ? `Due: ${new Date(t.due_at).toLocaleString()}` : `Created: ${fmt(t.created_at)}`}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => toggleTask(t.id)} className="px-2 py-1 border rounded text-sm bg-white">{t.completed ? 'Undo' : 'Done'}</button>
                    <button onClick={() => deleteTask(t.id)} className="text-[#fb7185] text-sm">Delete</button>
                  </div>
                </div>
              ))}

              {tasks.length === 0 && <div className="text-sm text-[#9ca3af]">No tasks</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Right column */}
      <aside className="space-y-4 lg:col-span-1">
        <div className="bg-white p-4 rounded-2xl shadow sticky top-6 border border-[#eef2f7]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-[#eef6ff] flex items-center justify-center font-semibold text-[#0f172a]">{(nameFor(lead).slice(0,2) || "").toUpperCase()}</div>
            <div>
              <div className="font-medium">{nameFor(lead)}</div>
              <div className="text-xs text-[#6b7280]">{lead.email}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <button onClick={() => window.open(`mailto:${lead.email}`)} className="w-full px-3 py-2 rounded bg-white border text-sm">Email</button>
            <button onClick={() => window.open(`tel:${lead.phone}`)} className="w-full px-3 py-2 rounded bg-white border text-sm">Call</button>
            <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(`${nameFor(lead)} <${lead.email}>`); showToast("Copied contact"); }} className="w-full px-3 py-2 rounded bg-white border text-sm">Copy Contact</button>
            <button onClick={() => {
              const phone = (lead.phone || "").replace(/[^+0-9]/g, "");
              if (!phone) return showToast("No phone number");
              const text = encodeURIComponent(`Hello ${nameFor(lead)}, I'm reaching out regarding your enquiry.`);
              window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
            }} className="w-full px-3 py-2 rounded bg-green-500 text-white text-sm">WhatsApp</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <h4 className="font-semibold mb-2">Communication</h4>

          <div className="text-xs text-[#9ca3af] mb-2">Call logs: <strong>{callStats.total}</strong> calls • <strong>{callStats.minutes}</strong> min</div>

          <div className="space-y-2">
            <select className="px-3 py-2 rounded border text-sm" value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)}>
              <option value="">Select template…</option>
              {templates.map((t, i) => <option key={i} value={t}>{t.slice(0,40)}{t.length>40?'…':''}</option>)}
              {scripts.map((s) => <option key={s.id} value={s.text}>{s.title}</option>)}
            </select>

            <textarea className="w-full px-3 py-2 border rounded text-sm" rows={3} value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} placeholder="Write message or pick a template..." />

            <div className="flex gap-2">
              <button onClick={() => sendMessage("sms")} disabled={sendingMessage} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Send SMS</button>
              <button onClick={() => sendMessage("whatsapp")} disabled={sendingMessage} className="px-3 py-2 rounded bg-green-500 text-white text-sm">WhatsApp</button>
              <button onClick={() => sendMessage("email")} disabled={sendingMessage} className="px-3 py-2 rounded bg-white border text-sm">Email</button>
            </div>

            <div className="mt-2 text-xs text-[#9ca3af]">Recent calls</div>
            <div className="mt-1 max-h-28 overflow-auto">
              {callLogs.slice(0,6).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm py-1">
                  <div>
                    <div className="font-medium">{c.outcome}</div>
                    <div className="text-xs text-[#9ca3af]">{fmt(c.created_at)} • {c.duration ? `${c.duration}s` : "—"}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => logCall("positive", 120)} className="px-2 py-1 text-xs rounded bg-white border">Log quick</button>
                  </div>
                </div>
              ))}

              {callLogs.length === 0 && <div className="text-xs text-[#9ca3af] py-2">No calls recorded</div>}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <div className="text-sm text-[#9ca3af]">Quick Actions</div>
          <div className="mt-3 flex flex-col gap-2">
            <button onClick={() => changeStatus('contacted')} className="px-3 py-2 rounded bg-white border text-sm">Mark Contacted</button>
            <button onClick={() => changeStatus('qualified')} className="px-3 py-2 rounded bg-white border text-sm">Mark Qualified</button>
            <button onClick={() => changeStatus('customer')} className="px-3 py-2 rounded bg-white border text-sm">Mark Customer</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <h4 className="font-semibold mb-2">Test Drive</h4>
          <div className="text-xs text-[#9ca3af] mb-2">Schedule test drive & assign vehicle</div>
          <input type="datetime-local" value={testDriveDate} onChange={(e) => setTestDriveDate(e.target.value)} className="px-3 py-2 border rounded w-full text-sm mb-2" />
          <input placeholder="Vehicle (e.g. Swift ZXi)" value={testDriveVehicle} onChange={(e) => setTestDriveVehicle(e.target.value)} className="px-3 py-2 border rounded w-full text-sm mb-2" />
          <div className="flex gap-2">
            <button onClick={scheduleTestDrive} className="px-3 py-2 rounded bg-gradient-to-r from-[#d6fff4] to-[#7dd3fc] text-[#042022] text-sm">Schedule</button>
            <button onClick={() => { setTestDriveDate(""); setTestDriveVehicle(""); }} className="px-3 py-2 rounded bg-white border text-sm">Clear</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <h4 className="font-semibold mb-2">Possible Duplicates</h4>
          <div className="text-xs text-[#9ca3af] mb-2">Find and merge duplicate leads</div>
          {duplicates.length === 0 && <div className="text-sm text-[#9ca3af]">No duplicates detected</div>}
          {duplicates.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-1 text-sm">
              <div>
                <div className="font-medium">{d.full_name}</div>
                <div className="text-xs text-[#9ca3af]">{d.phone || d.email}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => mergeDuplicate(d.id)} className="px-2 py-1 rounded bg-white border text-xs">Merge</button>
                <Link to={`/leads/${d.id}`} className="text-xs underline">Open</Link>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <h4 className="font-semibold mb-2">Related Leads</h4>
          {relatedLeads.length === 0 && <div className="text-sm text-[#9ca3af]">No related leads</div>}
          <div className="space-y-2">
            {relatedLeads.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{r.full_name}</div>
                  <div className="text-xs text-[#9ca3af]">{r.relationship || r.source || r.phone}</div>
                </div>
                <Link to={`/leads/${r.id}`} className="px-2 py-1 text-xs underline">Open</Link>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <h4 className="font-semibold mb-2">Internal Notes</h4>
          <textarea value={collabDraft} onChange={(e) => setCollabDraft(e.target.value)} placeholder="@mention teammate, add internal note..." className="w-full px-3 py-2 border rounded text-sm mb-2" />
          <div className="flex gap-2">
            <button onClick={addCollabNote} className="px-3 py-2 rounded bg-gradient-to-r from-[#d6fff4] to-[#7dd3fc] text-[#042022] text-sm">Add Note</button>
            <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(window.location.href); showToast("Share link copied"); }} className="px-3 py-2 rounded bg-white border text-sm">Copy share link</button>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            {collabNotes.map((n) => (
              <div key={n.id} className="bg-[#fbfdff] p-2 rounded border border-[#eef2f7]">
                <div className="font-medium">{n.author || "User"}</div>
                <div className="text-xs text-[#9ca3af]">{fmt(n.created_at)}</div>
                <div className="mt-1 text-sm text-[#0f172a]">{n.text}</div>
              </div>
            ))}
            {collabNotes.length === 0 && <div className="text-xs text-[#9ca3af]">No internal notes</div>}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow border border-[#eef2f7]">
          <h4 className="font-semibold mb-2">Map</h4>
          <div className="w-full h-40 bg-[#f8fafc] overflow-hidden rounded">
            <iframe title="map" src={mapSrc} width="100%" height="160" style={{ border: 0 }} loading="lazy" />
          </div>
          <div className="text-xs text-[#9ca3af] mt-2">Click map to open Google Maps.</div>
        </div>
      </aside>

      {/* Toast */}
      {toast && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className="bg-white p-3 rounded shadow flex items-center gap-3 border border-[#eef2f7]">
            <div className="text-sm text-[#0f172a]">{toast.text}</div>
            <button onClick={() => setToast(null)} className="text-xs text-[#9ca3af]">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
