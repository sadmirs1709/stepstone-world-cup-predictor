import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

const STORAGE_KEY = "stepstone-world-cup-predictor-auth-enabled";

const DEFAULT_PARTICIPANTS = [
  { id: 1, name: "Sadmir", email: "" },
  { id: 2, name: "Colleague A", email: "" },
  { id: 3, name: "Colleague B", email: "" },
];

const DEFAULT_MATCHES = [
  {
    id: 1,
    round: "Group Stage",
    home: "Brazil",
    away: "Japan",
    kickoff: "2026-06-11 18:00",
    result: "",
  },
  {
    id: 2,
    round: "Group Stage",
    home: "Germany",
    away: "Mexico",
    kickoff: "2026-06-12 21:00",
    result: "",
  },
  {
    id: 3,
    round: "Group Stage",
    home: "France",
    away: "USA",
    kickoff: "2026-06-13 18:00",
    result: "",
  },
  {
    id: 4,
    round: "Group Stage",
    home: "Spain",
    away: "Serbia",
    kickoff: "2026-06-14 21:00",
    result: "",
  },
];

const DEFAULT_PREDICTIONS = {
  1: { 1: "1", 2: "X", 3: "1", 4: "2" },
  2: { 1: "1", 2: "2", 3: "X", 4: "1" },
  3: { 1: "X", 2: "2", 3: "1", 4: "2" },
};

const DEFAULT_CHAMPIONS = {
  1: "Brazil",
  2: "France",
  3: "Spain",
};

const RULES = [
  "Each participant may submit only one entry.",
  "Predictions are based on the result after regular 90 minutes only (including added time). Extra time and penalty shootouts are not considered.",
  "Group Stage Scoring:\n• Correct outcome = 1 point\n• Incorrect outcome = 0 points",
  "Knockout Stage Scoring:\n• Correct outcome = 1 point\n• Correct exact score = 3 points",
  "Tournament Champion:\n• Correct champion prediction = 5 bonus points",
  "Tie-Breakers:\n• Most correct score points\n• Most correct outcome points\n• Correct champion prediction\n• Most knockout-stage points\n• Alphabetical order"
];

function createDefaultState() {
  return {
    competitionName: "StepStone World Cup Predictor 2026",
    lockRegistration: false,
    lockPredictions: true,
    pointsPerHit: 1,
    actualChampion: "",
    participants: DEFAULT_PARTICIPANTS.map((p) => ({ ...p })),
    matches: DEFAULT_MATCHES.map((m) => ({ ...m })),
    predictions: JSON.parse(JSON.stringify(DEFAULT_PREDICTIONS)),
    championTiebreak: { ...DEFAULT_CHAMPIONS },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    const fallback = createDefaultState();

    return {
      ...fallback,
      ...parsed,
      participants: parsed.participants || fallback.participants,
      matches: parsed.matches || fallback.matches,
      predictions: parsed.predictions || fallback.predictions,
      championTiebreak: parsed.championTiebreak || fallback.championTiebreak,
    };
  } catch {
    return createDefaultState();
  }
}

function parseKickoff(value) {
  if (!value) return null;
  const normalized = value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseKickoff(value);
  if (!date) return value || "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function outcomeLabel(value, match) {
  if (value === "1") return `${match.home} win`;
  if (value === "X") return "Draw";
  if (value === "2") return `${match.away} win`;
  return "—";
}

function formatActualResult(match) {
  if (!match.result) return "No result yet";

  const hasScore =
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined;

  const scoreText = hasScore ? ` (${match.homeScore}:${match.awayScore})` : "";

  if (match.result === "1") return `${match.home} win${scoreText}`;
  if (match.result === "2") return `${match.away} win${scoreText}`;
  return `Draw${scoreText}`;
}

function outcomeBadge(value, match) {
  if (value === "1") return match.home;
  if (value === "X") return "X";
  if (value === "2") return match.away;
  return "—";
}

function exportCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <div className="panel-title">{title}</div>
      {children}
    </section>
  );
}

function StatCard({ label, value, dark = false }) {
  return (
    <div className={`stat-card ${dark ? "stat-card-dark" : ""}`}>
      <div className={`stat-label ${dark ? "stat-label-dark" : ""}`}>{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function StatusBadge({ tone = "slate", text }) {
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

function StatusPill({ label, value }) {
  return (
    <div className="status-pill">
      <div className="status-pill-label">{label}</div>
      <div className="status-pill-value" style={{ whiteSpace: "pre-line" }}>
  {value}
</div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedParticipantId, setSelectedParticipantId] = useState(
    () => String(loadState().participants?.[0]?.id || 1)
  );
  const [selectedRound, setSelectedRound] = useState("All");
  const [newParticipant, setNewParticipant] = useState({ name: "", email: "" });
  const [newMatch, setNewMatch] = useState({
    round: "Group Stage",
    home: "",
    away: "",
    kickoff: "",
  });
  const [bulkImportText, setBulkImportText] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [scoreInputs, setScoreInputs] = useState({});

  // Auth state
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Shared Supabase-loaded data
  const [sharedSettings, setSharedSettings] = useState(null);
  const [sharedMatches, setSharedMatches] = useState([]);
  const [loadingSharedData, setLoadingSharedData] = useState(true);
  const [currentProfile, setCurrentProfile] = useState(null);
const [loadingProfile, setLoadingProfile] = useState(true);
const [newName, setNewName] = useState("");

const [sharedPredictions, setSharedPredictions] = useState({});
const [scorePredictions, setScorePredictions] = useState({});
const [sharedChampionPick, setSharedChampionPick] = useState("");
const [loadingPredictions, setLoadingPredictions] = useState(true);

const [sharedProfiles, setSharedProfiles] = useState([]);
const [loadingProfilesList, setLoadingProfilesList] = useState(true);

const [allSharedPredictions, setAllSharedPredictions] = useState({});
const [allSharedScorePredictions, setAllSharedScorePredictions] = useState({});
const [allSharedChampionPicks, setAllSharedChampionPicks] = useState({});
const [loadingAllSharedData, setLoadingAllSharedData] = useState(true);

  const {
    competitionName,
    lockRegistration,
    lockPredictions,
    pointsPerHit,
    actualChampion,
    participants,
    matches,
    predictions,
    championTiebreak,
  } = state;

  const effectiveCompetitionName =
    sharedSettings?.competitionName ?? competitionName;

  const effectiveLockRegistration =
    sharedSettings?.lockRegistration ?? lockRegistration;

  const effectiveLockPredictions =
    sharedSettings?.lockPredictions ?? lockPredictions;

  const effectivePointsPerHit =
    sharedSettings?.pointsPerHit ?? pointsPerHit;

  const effectiveActualChampion =
    sharedSettings?.actualChampion ?? actualChampion;

  const effectiveMatches =
    sharedMatches.length > 0 ? sharedMatches : matches;

    const effectivePredictions =
    Object.keys(sharedPredictions).length > 0
      ? {
          [String(selectedParticipantId)]: sharedPredictions,
        }
      : predictions;

const effectiveChampionPick =
  sharedChampionPick || championTiebreak[selectedParticipantId] || "";

  const effectiveParticipants =
  sharedProfiles.length > 0 ? sharedProfiles : participants;

  const effectiveAllPredictions =
  Object.keys(allSharedPredictions).length > 0
    ? allSharedPredictions
    : predictions;

const effectiveAllScorePredictions =
  Object.keys(allSharedScorePredictions).length > 0
    ? allSharedScorePredictions
    : {};

const effectiveAllChampionPicks =
  Object.keys(allSharedChampionPicks).length > 0
    ? allSharedChampionPicks
    : championTiebreak;

    const isAdmin = currentProfile?.role === "admin";

const competitionParticipants =
  effectiveParticipants.filter((participant) => participant.role !== "admin");

const currentParticipantId =
  !isAdmin && currentProfile?.id ? String(currentProfile.id) : "";

  const visibleTabs = [
    ["overview", "Overview"],
    ["participants", "Participants"],
    ["matches", "Matches"],
    ["predictions", "Predictions"],
    ["matrix", "Matrix"],
    ["leaderboard", "Leaderboard"],
    ["rules", "Rules"],
    ...(isAdmin
      ? [
          ["communications", "Communications"],
          ["admin", "Admin"],
        ]
      : []),
  ];

    useEffect(() => {
      let mounted = true;
    
      async function bootstrapAuth() {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
    
        if (!mounted) return;
    
        if (!error) {
          setUser(session?.user || null);
        }
    
        setLoadingAuth(false);
      }
    
      bootstrapAuth();
    
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        setUser(session?.user || null);
        setLoadingAuth(false);
      });
    
      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }, []);
    
  async function loadSharedData() {
    setLoadingSharedData(true);

    try {
      const [
        { data: settingsRow, error: settingsError },
        { data: matchRows, error: matchesError },
      ] = await Promise.all([
        supabase
          .from("competition_settings")
          .select("*")
          .eq("id", "main")
          .single(),
        supabase
          .from("matches")
          .select("*")
          .order("kickoff_at", { ascending: true }),
      ]);

      if (settingsError && settingsError.code !== "PGRST116") {
        console.error("Failed loading competition_settings:", settingsError);
      }

      if (matchesError) {
        console.error("Failed loading matches:", matchesError);
      }

      if (settingsRow) {
        setSharedSettings({
          competitionName:
            settingsRow.competition_name ?? "StepStone World Cup Predictor 2026",
          lockRegistration: settingsRow.registration_locked ?? false,
          lockPredictions: settingsRow.prediction_lock_enabled ?? true,
          pointsPerHit: settingsRow.points_per_hit ?? 1,
          actualChampion: settingsRow.actual_champion ?? "",
        });
      } else {
        setSharedSettings(null);
      }

      if (Array.isArray(matchRows)) {
        setSharedMatches(
          matchRows.map((row) => ({
            id: row.id,
            round: row.round,
            home: row.home_team,
            away: row.away_team,
            kickoff: row.kickoff_at
            ? new Date(row.kickoff_at)
                .toLocaleString("sv-SE", {
                  timeZone: "Europe/Luxembourg",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
                .replace(",", "")
            : "",
            result: row.result ?? "",
            homeScore: row.home_score ?? null,
awayScore: row.away_score ?? null,
          }))
        );
      } else {
        setSharedMatches([]);
      }
    } catch (err) {
      console.error("Unexpected shared data load error:", err);
    } finally {
      setLoadingSharedData(false);
    }
  }

  async function loadCurrentProfile() {
    if (!user?.id) {
      setCurrentProfile(null);
      setLoadingProfile(false);
      return;
    }
  
    setLoadingProfile(true);
  
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
  
      if (error) {
        console.error("Failed loading current profile:", error);
        setCurrentProfile(null);
        return;
      }
  
      setCurrentProfile(data || null);
    } catch (err) {
      console.error("Unexpected loadCurrentProfile error:", err);
      setCurrentProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }
  
  async function loadCurrentUserPredictionData() {
    if (!user?.id) {
      setSharedPredictions({});
      setScorePredictions({});
      setSharedChampionPick("");
      setLoadingPredictions(false);
      return;
    }
  
    setLoadingPredictions(true);
  
    try {
      const [
        { data: predictionRows, error: predictionsError },
        { data: championRow, error: championError },
      ] = await Promise.all([
supabase
  .from("predictions")
  .select("*")
  .order("updated_at", { ascending: false })
  .range(0, 5000)
  .eq("user_id", user.id),
        supabase
          .from("champion_picks")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
  
      if (predictionsError) {
        console.error("Failed loading current user predictions:", predictionsError);
        setSharedPredictions({});
        setScorePredictions({});
      } else {
        const mapped = {};
        const scoreMapped = {};
        
        for (const row of predictionRows || []) {
          mapped[row.match_id] = row.prediction;
        
          scoreMapped[row.match_id] = {
            home:
              row.predicted_home_score !== null && row.predicted_home_score !== undefined
                ? String(row.predicted_home_score)
                : "",
            away:
              row.predicted_away_score !== null && row.predicted_away_score !== undefined
                ? String(row.predicted_away_score)
                : "",
          };
        }
        
        setSharedPredictions(mapped);
        setScorePredictions(scoreMapped);
      }
  
      if (championError && championError.code !== "PGRST116") {
        console.error("Failed loading current user champion pick:", championError);
        setSharedChampionPick("");
      } else {
        setSharedChampionPick(championRow?.champion ?? "");
      }
    } catch (err) {
      console.error("Unexpected loadCurrentUserPredictionData error:", err);
      setSharedPredictions({});
      setSharedChampionPick("");
    } finally {
      setLoadingPredictions(false);
    }
  }

  async function updateCurrentUserChampionPick(value) {
    if (!user?.id) return;
  
    try {
      const champion = value.trim();
  
      if (!champion) {
        const { error } = await supabase
          .from("champion_picks")
          .delete()
          .eq("user_id", user.id);
  
        if (error) {
          console.error("Failed deleting champion pick:", error);
          return;
        }
  
        await loadCurrentUserPredictionData();
        showSaveNotice("Champion pick cleared ✅");
        return;
      }
  
      const { error } = await supabase
        .from("champion_picks")
        .upsert(
          {
            user_id: user.id,
            champion,
          },
          {
            onConflict: "user_id",
          }
        );
  
      if (error) {
        console.error("Failed updating champion pick:", error);
        return;
      }
  
      await loadCurrentUserPredictionData();
      showSaveNotice("Champion pick saved ✅");
    } catch (err) {
      console.error("Unexpected updateCurrentUserChampionPick error:", err);
    }
  }

  function showSaveNotice(message = "Saved ✅") {
    setSaveNotice(message);
    setTimeout(() => {
      setSaveNotice("");
    }, 1500);
  }

  function allowsScorePrediction(match) {
    return match?.round && match.round !== "Group Stage";
  }

  function getKickoffCountdown(match) {
    const kickoffDate = parseKickoff(match.kickoff);
    if (!kickoffDate) return "";
  
    const diffMs = kickoffDate.getTime() - nowTick;
  
    if (diffMs <= 0) return "Locked";
  
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
  
    if (days > 0) {
      return `Locks in ${days}d ${hours}h`;
    }
  
    if (hours > 0) {
      return `Locks in ${hours}h ${minutes}m`;
    }
  
    return `Locks in ${minutes}m`;
  }

  async function loadSharedProfiles() {
    setLoadingProfilesList(true);
  
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("display_name", { ascending: true });
  
      if (error) {
        console.error("Failed loading shared profiles:", error);
        setSharedProfiles([]);
        return;
      }
  
      const mapped = (data || []).map((row) => ({
        id: row.id,
        name: row.display_name || row.email || "Unknown participant",
        email: row.email || "",
        role: row.role || "participant",
      }));
  
      setSharedProfiles(mapped);
    } catch (err) {
      console.error("Unexpected loadSharedProfiles error:", err);
      setSharedProfiles([]);
    } finally {
      setLoadingProfilesList(false);
    }
  }

  async function loadAllSharedPredictionData() {
    setLoadingAllSharedData(true);
  
    try {
      const [
        { data: predictionRows, error: predictionsError },
        { data: championRows, error: championError },
      ] = await Promise.all([
supabase
.from("predictions")
.select("*")
.in(
  "match_id",
  effectiveMatches.map(m => m.id)
),

        supabase
          .from("champion_picks")
          .select("*"),
      ]);

      alert(`predictionRows length = ${predictionRows.length}`);
  
      if (predictionsError) {
        console.error("Failed loading all shared predictions:", predictionsError);
        setAllSharedPredictions({});
        setAllSharedScorePredictions({});
      } else {
        const mappedPredictions = {};
const mappedScorePredictions = {};

for (const row of predictionRows || []) {
  const userId = String(row.user_id);
  const matchId = String(row.match_id);

  if (!mappedPredictions[userId]) {
    mappedPredictions[userId] = {};
  }

  if (!mappedScorePredictions[userId]) {
    mappedScorePredictions[userId] = {};
  }

  mappedPredictions[userId][matchId] = row.prediction;

  mappedScorePredictions[userId][matchId] = {
    home:
      row.predicted_home_score !== null && row.predicted_home_score !== undefined
        ? Number(row.predicted_home_score)
        : null,
    away:
      row.predicted_away_score !== null && row.predicted_away_score !== undefined
        ? Number(row.predicted_away_score)
        : null,
  };
}

const users254 = Object.entries(mappedPredictions)
  .filter(([_, matches]) => matches["254"])
  .length;

const users255 = Object.entries(mappedPredictions)
  .filter(([_, matches]) => matches["255"])
  .length;

setAllSharedPredictions(mappedPredictions);
setAllSharedScorePredictions(mappedScorePredictions);
      }
  
      if (championError) {
        console.error("Failed loading all shared champion picks:", championError);
        setAllSharedChampionPicks({});
      } else {
        const mappedChampionPicks = {};
        for (const row of championRows || []) {
          mappedChampionPicks[String(row.user_id)] = row.champion;
        }
        setAllSharedChampionPicks(mappedChampionPicks);
      }
    } catch (err) {
      console.error("Unexpected loadAllSharedPredictionData error:", err);
      setAllSharedPredictions({});
      setAllSharedScorePredictions({});
      setAllSharedChampionPicks({});
    } finally {
      setLoadingAllSharedData(false);
    }
  }

  async function updateCompetitionSettings(patch) {
    try {
      const { error } = await supabase
        .from("competition_settings")
        .update(patch)
        .eq("id", "main");
  
      if (error) {
        console.error("Failed updating competition_settings:", error);
        return false;
      }
  
      await loadSharedData();
      return true;
    } catch (err) {
      console.error("Unexpected updateCompetitionSettings error:", err);
      return false;
    }
  }

  useEffect(() => {
    if (user) {
      loadSharedData();
    } else {
      setSharedSettings(null);
      setSharedMatches([]);
      setLoadingSharedData(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadCurrentProfile();
    } else {
      setCurrentProfile(null);
      setLoadingProfile(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadCurrentUserPredictionData();
    } else {
      setSharedPredictions({});
      setSharedChampionPick("");
      setLoadingPredictions(false);
    }
  }, [user]);
  
  useEffect(() => {
    if (user) {
      loadSharedProfiles();
    } else {
      setSharedProfiles([]);
      setLoadingProfilesList(false);
    }
  }, [user]);
  
  useEffect(() => {
    if (!effectiveParticipants.length) return;
  
    const exists = effectiveParticipants.some(
      (participant) => String(participant.id) === String(selectedParticipantId)
    );
  
    if (!exists) {
      setSelectedParticipantId(String(effectiveParticipants[0].id));
    }
  }, [effectiveParticipants, selectedParticipantId]);

  useEffect(() => {
    if (user) {
      loadAllSharedPredictionData();
    } else {
      setAllSharedPredictions({});
      setAllSharedChampionPicks({});
      setLoadingAllSharedData(false);
    }
}, [user, nowTick]);

  useEffect(() => {
    if (!isAdmin && currentParticipantId) {
      setSelectedParticipantId(currentParticipantId);
    }
  }, [isAdmin, currentParticipantId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 60000);
  
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const mappedScores = Object.fromEntries(
      effectiveMatches.map((match) => [
        String(match.id),
        {
          home:
            match.homeScore !== null && match.homeScore !== undefined
              ? String(match.homeScore)
              : "",
          away:
            match.awayScore !== null && match.awayScore !== undefined
              ? String(match.awayScore)
              : "",
        },
      ])
    );
  
    setScoreInputs(mappedScores);
  }, [effectiveMatches]);  

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  async function sendMagicLink() {
    if (!email.trim()) {
      setAuthMessage("Please enter your work email address.");
      return;
    }

    setAuthMessage("Sending sign-in link...");

    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      console.log("signInWithOtp data:", data);
      console.log("signInWithOtp error:", error);

      if (error) {
        setAuthMessage(`Supabase error: ${error.message}`);
        return;
      }

      setAuthMessage("Check your email for the sign-in link.");
    } catch (err) {
      console.error("Unexpected auth error:", err);
      setAuthMessage(`Unexpected error: ${err?.message || "Failed to fetch"}`);
    }
  }

  async function signOutUser() {
    await supabase.auth.signOut();
  }

  const updateState = (patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const rounds = useMemo(() => {
    const unique = Array.from(new Set(effectiveMatches.map((m) => m.round)));
    return ["All", ...unique];
  }, [effectiveMatches]);

  const filteredMatches = useMemo(() => {
    if (selectedRound === "All") return effectiveMatches;
    return effectiveMatches.filter((m) => m.round === selectedRound);
  }, [effectiveMatches, selectedRound]);

  const isLocked = (match) => {
    if (!effectiveLockPredictions) return false;
    const kickoffDate = parseKickoff(match.kickoff);
    if (!kickoffDate) return false;
    return new Date() >= kickoffDate;
  };

  const leaderboard = useMemo(() => {
    const rows = competitionParticipants.map((participant) => {
      let points = 0;
      let hits = 0;
      let exactScores = 0;
      let entered = 0;

      for (const match of effectiveMatches) {
        const participantId = String(participant.id);
        const matchId = String(match.id);
      
        const pick = effectiveAllPredictions[participantId]?.[matchId];
        const scorePick = effectiveAllScorePredictions[participantId]?.[matchId];
      
        const hasOutcomePick = Boolean(pick);
      
        const hasScorePick =
          scorePick &&
          scorePick.home !== null &&
          scorePick.home !== undefined &&
          scorePick.away !== null &&
          scorePick.away !== undefined;
      
        if (hasOutcomePick || hasScorePick) entered += 1;
      
        if (hasOutcomePick && match.result && pick === match.result) {
          points += effectivePointsPerHit;
          hits += 1;
        }
      
        const hasActualScore =
          match.homeScore !== null &&
          match.homeScore !== undefined &&
          match.awayScore !== null &&
          match.awayScore !== undefined;
      
        const exactScoreCorrect =
          allowsScorePrediction(match) &&
          hasScorePick &&
          hasActualScore &&
          Number(scorePick.home) === Number(match.homeScore) &&
          Number(scorePick.away) === Number(match.awayScore);
      
          if (exactScoreCorrect) {
            points += 3;
            exactScores += 3;
          }
      }
      
      const championPick = effectiveAllChampionPicks[String(participant.id)] || "";
      const championHit =
        effectiveActualChampion &&
        championPick &&
        championPick.trim().toLowerCase() ===
          effectiveActualChampion.trim().toLowerCase()
          ? 1
          : 0;

          if (championHit === 1) {
            points += 5;
          }

      return {
        ...participant,
        points,
        hits,
        exactScores,
        entered,
        completion: effectiveMatches.length
          ? Math.round((entered / effectiveMatches.length) * 100)
          : 0,
        championPick: championPick || "—",
        championHit,
      };
    });

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.championHit !== a.championHit) return b.championHit - a.championHit;
      if (b.hits !== a.hits) return b.hits - a.hits;
      return a.name.localeCompare(b.name);
    });

    return rows;
  }, [
    competitionParticipants,
    effectiveMatches,
    effectiveAllPredictions,
    effectiveAllScorePredictions,
    effectiveAllChampionPicks,
    effectiveActualChampion,
    effectivePointsPerHit,
  ]);

  const standingsByRound = useMemo(() => {
    const result = {};
    for (const round of rounds.filter((r) => r !== "All")) {
      result[round] = competitionParticipants
        .map((participant) => {
          const roundMatches = effectiveMatches.filter((m) => m.round === round);
          const hits = roundMatches.filter(
            (m) =>
              m.result &&
              effectiveAllPredictions[String(participant.id)]?.[String(m.id)] === m.result
          ).length;

          return {
            participantId: participant.id,
            name: participant.name,
            hits,
            points: hits * effectivePointsPerHit,
          };
        })
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    }
    return result;
  }, [rounds, competitionParticipants, effectiveMatches, effectiveAllPredictions, effectivePointsPerHit]);

  const completedMatches = effectiveMatches.filter((m) => m.result).length;
  const lockedMatches = effectiveMatches.filter(
    (m) => !m.result && isLocked(m)
  ).length;
  const openMatches = effectiveMatches.filter(
    (m) => !m.result && !isLocked(m)
  ).length;

  const totalTournamentMatches = 104;

  const displayTotalMatches = 104;
  const displayOpenMatches = openMatches;
  const displayLockedMatches = displayTotalMatches - displayOpenMatches;

  const currentLeader = leaderboard.length > 0 ? leaderboard[0] : null;

const matchProgressPct = totalTournamentMatches
  ? Math.round((completedMatches / totalTournamentMatches) * 100)
  : 0;

  const currentStageLabel = "Knockout Stage";

  const totalPredictions =
  competitionParticipants.length * effectiveMatches.length;

  const enteredPredictions = competitionParticipants.reduce((acc, participant) => {
    return (
      acc +
      Object.values(
        effectiveAllPredictions[String(participant.id)] || {}
      ).filter(Boolean).length
    );
  }, 0);

  const selectedParticipant =
  effectiveParticipants.find((p) => p.id === selectedParticipantId) ||
  effectiveParticipants[0];

  const nextOpenMatch = useMemo(() => {
    return effectiveMatches
    .filter((m) => !m.result && !isLocked(m))
      .sort(
        (a, b) =>
          (parseKickoff(a.kickoff)?.getTime() || 0) -
          (parseKickoff(b.kickoff)?.getTime() || 0)
      )[0];
  }, [effectiveMatches, effectiveLockPredictions]);

  function goToTab(tabKey) {
    setActiveTab(tabKey);
  
    setTimeout(() => {
      document
        .getElementById("tab-content-start")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  const overviewHeroCards = (
  
<div className="overview-stack">
    <div className="overview-grid-2">
      <div className="overview-feature-card overview-feature-card-leader">
        <div className="overview-card-label">🏆 Current Leader</div>

        {currentLeader ? (
          <>
            <div className="overview-feature-title">{currentLeader.name}</div>
            <div className="overview-feature-points">
              {currentLeader.points} points
            </div>

            <button
              className="overview-ghost-button"
              onClick={() => goToTab("leaderboard")}
            >
              View leaderboard →
            </button>
          </>
        ) : (
          <div className="info-box">
            No leaderboard data available yet.
          </div>
        )}
      </div>

      <div className="overview-feature-card overview-feature-card-match">
        <div className="overview-card-label">📅 Next Open Match</div>

        {nextOpenMatch ? (
          <>
            <div className="overview-feature-title">
              {nextOpenMatch.home} vs {nextOpenMatch.away}
            </div>

            <div className="overview-feature-meta">
              {formatDateTime(nextOpenMatch.kickoff)} (CEST)
            </div>

            <button
              className="overview-primary-button"
              onClick={() => goToTab("predictions")}
            >
              Make your predictions →
            </button>
          </>
        ) : (
          <div className="info-box">
            No open matches available right now.
          </div>
        )}
      </div>
    </div>

    <div className="overview-status-card">
      <div className="overview-card-label">📊 Competition Status</div>

      <div className="overview-status-grid">
        <div className="overview-progress-box">
          <div
            className="overview-progress-ring"
            style={{ "--overview-progress": matchProgressPct }}
          >
            <div className="overview-progress-ring-inner">
              {matchProgressPct}%
            </div>
          </div>

          <div className="overview-progress-text">
            <div className="overview-progress-value">
              {completedMatches}/{totalTournamentMatches}
            </div>
            <div className="overview-progress-label">matches completed</div>
          </div>
        </div>

        <div className="overview-status-notes">
        <div className="overview-note-card">
  <div className="overview-note-title">🔄 Live competition updates</div>
  <div className="overview-note-text">
    Refresh the page anytime to see the latest match results and leaderboard changes.
  </div>
</div>

          <div className="overview-note-card">
            <div className="overview-note-title">🏁 Current stage</div>
            <div className="overview-note-text">{currentStageLabel}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

  const lastSettledMatches = useMemo(() => {
    return effectiveMatches.filter((m) => m.result).slice(-5).reverse();
  }, [effectiveMatches]);

  const addParticipant = () => {
    if (effectiveLockRegistration) return;

    const name = newParticipant.name.trim();
    const emailValue = newParticipant.email.trim();
    if (!name) return;

    const nextId = participants.length
      ? Math.max(...participants.map((p) => p.id)) + 1
      : 1;

    updateState({
      participants: [...participants, { id: nextId, name, email: emailValue }],
      predictions: {
        ...predictions,
        [nextId]: {},
      },
      championTiebreak: {
        ...championTiebreak,
        [nextId]: "",
      },
    });

    setNewParticipant({ name: "", email: "" });
    setSelectedParticipantId(nextId);
  };

  const removeParticipant = (participantId) => {
    if (effectiveLockRegistration) return;

    const remaining = participants.filter((p) => p.id !== participantId);
    const nextPredictions = { ...predictions };
    delete nextPredictions[participantId];

    const nextChampionTiebreak = { ...championTiebreak };
    delete nextChampionTiebreak[participantId];

    updateState({
      participants: remaining,
      predictions: nextPredictions,
      championTiebreak: nextChampionTiebreak,
    });

    if (selectedParticipantId === participantId) {
      setSelectedParticipantId(remaining[0]?.id || 1);
    }
  };

  const addMatch = async () => {
    const round = newMatch.round.trim();
    const home = newMatch.home.trim();
    const away = newMatch.away.trim();
    const kickoff = newMatch.kickoff.trim();

    if (!round || !home || !away || !kickoff) return;

    try {
      const kickoffIso = new Date(kickoff.replace(" ", "T")).toISOString();

      const { error } = await supabase.from("matches").insert([
        {
          round,
          home_team: home,
          away_team: away,
          kickoff_at: kickoffIso,
          result: null,
        },
      ]);

      if (error) {
        console.error("Failed inserting match:", error);
        return;
      }

      await loadSharedData();

      setNewMatch({
        round: "Group Stage",
        home: "",
        away: "",
        kickoff: "",
      });
    } catch (err) {
      console.error("Unexpected addMatch error:", err);
    }
  };

  const removeMatch = async (matchId) => {
    try {
      const { error } = await supabase
        .from("matches")
        .delete()
        .eq("id", matchId);
  
      if (error) {
        console.error("Failed deleting match:", error);
        return;
      }
  
      await loadSharedData();
    } catch (err) {
      console.error("Unexpected removeMatch error:", err);
    }
  };

  const setMatchResult = async (matchId, value) => {
    try {
      const { error } = await supabase
        .from("matches")
        .update({ result: value || null })
        .eq("id", matchId);
  
      if (error) {
        console.error("Failed updating match result:", error);
        return;
      }
  
      await loadSharedData();
    } catch (err) {
      console.error("Unexpected setMatchResult error:", err);
    }
  };

  async function saveMatchScore(matchId) {
    const current = scoreInputs[String(matchId)] || { home: "", away: "" };
  
    const homeRaw = current.home?.trim?.() ?? "";
    const awayRaw = current.away?.trim?.() ?? "";
  
    if (homeRaw === "" || awayRaw === "") {
      console.error("Both score fields must be filled.");
      return;
    }
  
    const homeScore = Number(homeRaw);
    const awayScore = Number(awayRaw);
  
    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      console.error("Scores must be whole numbers greater than or equal to 0.");
      return;
    }
  
    let derivedResult = "X";
    if (homeScore > awayScore) derivedResult = "1";
    if (awayScore > homeScore) derivedResult = "2";
  
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          result: derivedResult,
        })
        .eq("id", matchId);
  
      if (error) {
        console.error("Failed saving match score:", error);
        return;
      }
  
      await loadSharedData();
      showSaveNotice("Score saved ✅");
    } catch (err) {
      console.error("Unexpected saveMatchScore error:", err);
    }
  }

  const updatePrediction = async (_participantId, matchId, value) => {
    const match = effectiveMatches.find((m) => String(m.id) === String(matchId));
    if (match && isLocked(match)) return;
    if (!user?.id) return;
  
    try {
      const { error } = await supabase
        .from("predictions")
        .upsert(
          {
            user_id: user.id,
            match_id: matchId,
            prediction: value,
          },
          {
            onConflict: "user_id,match_id",
          }
        );
  
        if (error) {
  console.error("Failed updating prediction:", error);
  return;
}

await loadCurrentUserPredictionData();
showSaveNotice("Prediction saved ✅");
    } catch (err) {
      console.error("Unexpected updatePrediction error:", err);
    }
  };

  async function updateScorePrediction(matchId) {
    if (!user?.id) return;
  
    const current = scorePredictions[String(matchId)] || { home: "", away: "" };
  
    const homeRaw = current.home?.trim?.() ?? "";
    const awayRaw = current.away?.trim?.() ?? "";
  
    if (homeRaw === "" || awayRaw === "") {
      showSaveNotice("Enter both scores first");
      return;
    }
  
    const homeScore = Number(homeRaw);
    const awayScore = Number(awayRaw);
  
    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      showSaveNotice("Scores must be whole numbers");
      return;
    }
  
    try {
      const { error } = await supabase
  .from("predictions")
  .upsert(
    {
      user_id: user.id,
      match_id: matchId,
      prediction:
        sharedPredictions[matchId] ||
        sharedPredictions[String(matchId)] ||
        null,
      predicted_home_score: homeScore,
      predicted_away_score: awayScore,
    },
    {
      onConflict: "user_id,match_id",
    }
  );
  
      if (error) {
        console.error("Failed saving score prediction:", error);
        return;
      }
  
await loadCurrentUserPredictionData();
showSaveNotice("Score prediction saved ✅");
    } catch (err) {
      console.error("Unexpected updateScorePrediction error:", err);
    }
  }

  const updateChampionTiebreak = (participantId, value) => {
    updateState({
      championTiebreak: {
        ...championTiebreak,
        [participantId]: value,
      },
    });
  };

  const importMatches = () => {
    const lines = bulkImportText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return;

    let nextId = matches.length ? Math.max(...matches.map((m) => m.id)) + 1 : 1;
    const imported = [];

    for (const line of lines) {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length < 4) continue;

      imported.push({
        id: nextId++,
        round: parts[0],
        home: parts[1],
        away: parts[2],
        kickoff: parts[3],
        result: "",
      });
    }

    if (!imported.length) return;

    updateState({
      matches: [...matches, ...imported],
    });

    setBulkImportText("");
  };

  const exportLeaderboardCsv = () => {
    const rows = [
      [
        "Rank",
        "Name",
        "Email",
        "Points",
        "Correct Picks",
        "Completion %",
        "Predicted Champion",
        "Tie-break Hit",
      ],
      ...leaderboard.map((row, index) => [
        index + 1,
        row.name,
        row.email || "",
        row.points,
        row.hits,
        row.completion,
        row.championPick,
        row.championHit ? "YES" : "NO",
      ]),
    ];

    exportCsv("leaderboard.csv", rows);
  };

  const exportPredictionsCsv = () => {
    const header = ["Participant", ...effectiveMatches.map((m) => `${m.home} vs ${m.away}`)];
    const rows = participants.map((participant) => [
      participant.name,
      ...effectiveMatches.map((match) =>
        outcomeBadge(predictions[participant.id]?.[match.id] || "", match)
      ),
    ]);

    exportCsv("predictions_matrix.csv", [header, ...rows]);
  };

  const generateDailySummaryText = () => {
    const lines = [];
    lines.push(`🏆 ${effectiveCompetitionName} — Daily Leaderboard`);
    lines.push("");

    const ranked = leaderboard.slice(0, 5);
    if (ranked.length) {
      lines.push("Top 5:");
      ranked.forEach((row, index) => {
        lines.push(
          `${index + 1}. ${row.name} — ${row.points} points (${row.hits} correct picks, ${row.completion}% completion)`
        );
      });
      lines.push("");
    }

    if (lastSettledMatches.length) {
      lines.push("Latest completed matches:");
      lastSettledMatches.forEach((match) => {
        lines.push(
          `- ${match.home} vs ${match.away} → ${outcomeLabel(match.result, match)}`
        );
      });
      lines.push("");
    }

    if (nextOpenMatch) {
      lines.push(
        `Next open match: ${nextOpenMatch.home} vs ${nextOpenMatch.away} (${formatDateTime(
          nextOpenMatch.kickoff
        )})`
      );
      lines.push("");
    }

    lines.push(`Completed matches: ${completedMatches}/${effectiveMatches.length}`);
    lines.push(`Predictions entered: ${enteredPredictions}/${totalPredictions}`);
    return lines.join("\n");
  };

  const generateAndCopySummary = async () => {
    const text = generateDailySummaryText();
    setSummaryText(text);
    setSummaryCopied(false);

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setSummaryCopied(true);
      }
    } catch {
      setSummaryCopied(false);
    }
  };

  const resetCompetition = () => {
    const confirmed = window.confirm(
      "Are you sure you want to reset the competition? This will restore the demo data."
    );
    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);
    const resetState = createDefaultState();
    setState(resetState);
    setActiveTab("overview");
    setSelectedParticipantId(resetState.participants[0].id);
    setSelectedRound("All");
    setNewParticipant({ name: "", email: "" });
    setNewMatch({
      round: "Group Stage",
      home: "",
      away: "",
      kickoff: "",
    });
    setBulkImportText("");
    setSummaryText("");
    setSummaryCopied(false);
  };

  if (loadingAuth) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f8fb",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 18,
            padding: 24,
            minWidth: 320,
            boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800 }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (user && loadingSharedData) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f8fb",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 18,
            padding: 24,
            minWidth: 320,
            boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Loading competition data…
          </div>
        </div>
      </div>
    );
  }

  if (user && loadingProfile) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f8fb",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 18,
            padding: 24,
            minWidth: 320,
            boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Loading profile…
          </div>
        </div>
      </div>
    );
  }

  if (user && currentProfile && !currentProfile.display_name) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f6f8fb",
          padding: 24,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 22,
            padding: 28,
            boxShadow: "0 14px 28px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              padding: "6px 12px",
              borderRadius: 999,
              background: "#0f172a",
              color: "white",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 16,
            }}
          >
            OFFICE COMPETITION
          </div>
  
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#0f172a",
            }}
          >
            Choose your participant name
          </h1>
  
          <p
            style={{
              color: "#475569",
              lineHeight: 1.6,
              marginTop: 12,
              marginBottom: 20,
            }}
          >
            This is how your name will appear in the competition, leaderboard, and matrix.
          </p>
  
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter your name"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid #cbd5e1",
              marginBottom: 12,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
  
          <button
            onClick={async () => {
              const trimmedName = newName.trim();
              if (!trimmedName || !user?.id) return;
  
              const { error } = await supabase
                .from("profiles")
                .update({ display_name: trimmedName })
                .eq("id", user.id);
  
              if (error) {
                console.error("Failed updating display name:", error);
                return;
              }
  
              window.location.reload();
            }}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              background: "linear-gradient(180deg, #0f172a, #111827)",
              color: "white",
              border: "1px solid #0f172a",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(15, 23, 42, 0.16)",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(circle at top left, rgba(59,130,246,0.06), transparent 25%), linear-gradient(180deg, #f6f8fb 0%, #eef3f8 100%)",
          padding: 24,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 22,
            padding: 28,
            boxShadow: "0 14px 28px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              padding: "6px 12px",
              borderRadius: 999,
              background: "#0f172a",
              color: "white",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 16,
            }}
          >
            StepStone Office Predictor
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 30,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#0f172a",
            }}
          >
            Sign in to join the competition
          </h1>

          <p
            style={{
              color: "#475569",
              lineHeight: 1.6,
              marginTop: 12,
              marginBottom: 20,
            }}
          >
            Enter your email address to receive a secure sign-in link and join the competition in seconds.
          </p>

          <label
            style={{
              display: "block",
              fontWeight: 700,
              marginBottom: 8,
              color: "#334155",
            }}
          >
            Email address
          </label>

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid #cbd5e1",
              marginBottom: 12,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={sendMagicLink}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              background: "linear-gradient(180deg, #0f172a, #111827)",
              color: "white",
              border: "1px solid #0f172a",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(15, 23, 42, 0.16)",
            }}
          >
            Send sign-in link
          </button>

          {authMessage ? (
            <div
              style={{
                marginTop: 14,
                color: "#475569",
                lineHeight: 1.5,
                fontSize: 14,
              }}
            >
              {authMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{css}</style>

      <div className="app-shell">
        <div className="app-container">
          <section className="dashboard-hero">
            <div className="dashboard-main">
              <div className="dashboard-badge">Office Competition</div>
              <h1 className="dashboard-title">{effectiveCompetitionName}</h1>
              <p className="dashboard-subtitle">
              Pick your winners, track your score, and prove you are the office football expert!
              </p>

              <div className="status-strip">
                <StatusPill
                  label="Registration"
                  value={effectiveLockRegistration ? "Locked" : "Open"}
                />
                <StatusPill
                  label="Predictions"
                  value={effectiveLockPredictions ? "Lock at kickoff" : "Open editing"}
                />
<StatusPill
  label="Scoring"
  value={`1 point per correct outcome
3 points per correct score
5 points for correct champion`}
/>
              </div>

              <div className="dashboard-user-row">
                <span className="badge badge-slate">{user.email || "Signed in"}</span>
                <button className="btn-secondary" onClick={signOutUser}>
                  Sign out
                </button>
              </div>
            </div>

            <div className="dashboard-side">
  <StatCard label="Participants" value={competitionParticipants.length} dark />
  <StatCard label="Matches" value={displayTotalMatches} dark />
  <StatCard label="Open matches" value={displayOpenMatches} dark />
  <StatCard label="Locked matches" value={displayLockedMatches} dark />
</div>

          </section>

          {overviewHeroCards}

          <section className="tabs-wrap">
  {visibleTabs.map(([key, label]) => (
    <button
      key={key}
      className={`tab-btn ${activeTab === key ? "tab-btn-active" : ""}`}
      onClick={() => setActiveTab(key)}
    >
      {label}
    </button>
  ))}
</section>

<div id="tab-content-start" />

{activeTab === "overview" && (
  <div className="grid-1">
    <Panel title="👋 Welcome">
      <div className="welcome-shell">
        <div className="welcome-intro">
          Welcome to the StepStone World Cup Predictor 2026! Use the tabs above to
          manage participants, check matches, make predictions, view the matrix,
          track the leaderboard, and read the official rules.
        </div>

        <div className="welcome-grid">
          <div className="welcome-item">
            <div className="welcome-icon">🎯</div>
            <div>
              <div className="welcome-item-title">Make your predictions</div>
              <div className="welcome-item-text">
                Submit your 1 / X / 2 predictions before each match kicks off.
              </div>
            </div>
          </div>

          <div className="welcome-item">
            <div className="welcome-icon">🏆</div>
            <div>
              <div className="welcome-item-title">Track your progress</div>
              <div className="welcome-item-text">
                Earn points for correct outcomes and climb the leaderboard.
              </div>
            </div>
          </div>

          <div className="welcome-item">
            <div className="welcome-icon">⭐</div>
            <div>
              <div className="welcome-item-title">Be the champion</div>
              <div className="welcome-item-text">
                Pick the overall champion and break ties if it comes to that!
              </div>
            </div>
          </div>
        </div>

        <div className="welcome-banner">
          🔒 Predictions lock at kickoff. Good luck and enjoy the competition!
        </div>
      </div>
    </Panel>
  </div>
)}

          {activeTab === "participants" && (
            <div className="grid-2">
              <Panel title="Participants">

  <div className="section-top-gap">
    <StatusBadge
      tone={effectiveLockRegistration ? "amber" : "green"}
      text={effectiveLockRegistration ? "Registration locked" : "Registration open"}
    />
  </div>
</Panel>

<Panel title="Competition participants">
                <div className="stack-10">
                {competitionParticipants.map((participant) => (
                    <div key={participant.id} className="list-row">
                      <div>
                        <div className="list-title">{participant.name}</div>
                        <div className="list-meta">{participant.email || "No email"}</div>
                      </div>

                      <StatusBadge
  tone={participant.role === "admin" ? "slate" : "green"}
  text={participant.role === "admin" ? "Admin" : "Participant"}
/>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "matches" && (
            <div className={isAdmin ? "grid-2" : "grid-1"}>
              {isAdmin ? (
              <Panel title="Add match">
                <div className="form-grid-2">
                  <select
                    className="input"
                    value={newMatch.round}
                    onChange={(e) =>
                      setNewMatch((prev) => ({ ...prev, round: e.target.value }))
                    }
                  >
                    <option>Group Stage</option>
                    <option>Round of 16</option>
                    <option>Quarter-finals</option>
                    <option>Semi-finals</option>
                    <option>Final</option>
                  </select>

                  <input
                    className="input"
                    placeholder="2026-06-15 18:00"
                    value={newMatch.kickoff}
                    onChange={(e) =>
                      setNewMatch((prev) => ({ ...prev, kickoff: e.target.value }))
                    }
                  />

                  <input
                    className="input"
                    placeholder="Home team"
                    value={newMatch.home}
                    onChange={(e) =>
                      setNewMatch((prev) => ({ ...prev, home: e.target.value }))
                    }
                  />

                  <input
                    className="input"
                    placeholder="Away team"
                    value={newMatch.away}
                    onChange={(e) =>
                      setNewMatch((prev) => ({ ...prev, away: e.target.value }))
                    }
                  />
                </div>

                <button className="btn-primary mt-12" onClick={addMatch}>
                  Add match
                </button>

                <div className="section-top-gap">
                  <div className="section-subtitle">Bulk import</div>
                  <div className="small-muted">
                    Use one line per match in this format:
                    <br />
                    <strong>Round | Home Team | Away Team | 2026-06-15 18:00</strong>
                  </div>

                  <textarea
                    className="input textarea"
                    placeholder="Group Stage | Argentina | Croatia | 2026-06-16 21:00"
                    value={bulkImportText}
                    onChange={(e) => setBulkImportText(e.target.value)}
                  />

                  <button className="btn-secondary mt-10" onClick={importMatches}>
                    Import matches
                  </button>
                </div>
              </Panel>
              ) : null}

<Panel title="⚽ Fixtures and results">
              <div className="stack-12">
  {effectiveMatches.length === 0 ? (
    <div className="info-box">
      No matches yet — the admin can add fixtures once the competition is ready.
    </div>
  ) : (
    effectiveMatches.map((match) => (
                    <div key={match.id} className="match-card">
                      <div className="match-header">
                        <div>
                          <div className="match-round">{match.round}</div>
                          <div className="match-title">
                            {match.home} vs {match.away}
                          </div>
                          <div className="match-kickoff">{formatDateTime(match.kickoff)}</div>
                        </div>

                        <div className="stack-8">
                          <StatusBadge
                            tone={isLocked(match) ? "slate" : "green"}
                            text={isLocked(match) ? "Locked" : "Open"}
                          />
{isAdmin ? (
  <button className="btn-danger" onClick={() => removeMatch(match.id)}>
  Delete match
</button>
) : null}
                        </div>
                      </div>

{isAdmin ? (
  <>
    <div className="button-row-wrap">
    <button
      className={`btn-outcome ${
        match.result === "1" ? "btn-outcome-active" : ""
      }`}
      onClick={() => setMatchResult(match.id, "1")}
    >
      {match.home}
    </button>
    <button
      className={`btn-outcome ${
        match.result === "X" ? "btn-outcome-active" : ""
      }`}
      onClick={() => setMatchResult(match.id, "X")}
    >
      X
    </button>
    <button
      className={`btn-outcome ${
        match.result === "2" ? "btn-outcome-active" : ""
      }`}
      onClick={() => setMatchResult(match.id, "2")}
    >
      {match.away}
    </button>
    <button className="btn-secondary" onClick={() => setMatchResult(match.id, "")}>
  Clear result
</button>
</div>

<div className="score-row">
  <input
    className="score-input"
    type="number"
    min="0"
    placeholder={match.home}
    value={scoreInputs[String(match.id)]?.home || ""}
    onChange={(e) =>
      setScoreInputs((prev) => ({
        ...prev,
        [String(match.id)]: {
          home: e.target.value,
          away: prev[String(match.id)]?.away || "",
        },
      }))
    }
  />

  <span className="score-separator">:</span>

  <input
    className="score-input"
    type="number"
    min="0"
    placeholder={match.away}
    value={scoreInputs[String(match.id)]?.away || ""}
    onChange={(e) =>
      setScoreInputs((prev) => ({
        ...prev,
        [String(match.id)]: {
          home: prev[String(match.id)]?.home || "",
          away: e.target.value,
        },
      }))
    }
  />

  <button className="btn-primary" onClick={() => saveMatchScore(match.id)}>
    Save score
  </button>
</div>
</>
) : null}

                      <div className="match-result-text">
                        Actual result: <strong>{formatActualResult(match)}</strong>
                      </div>
                    </div>
                  ))
                  )}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "predictions" && (
            <div className="grid-predictions">
              <Panel title="Prediction Settings">
                <div className="stack-14">
                {isAdmin ? (
  <div>
    <label className="label">Participant</label>
    <select
      className="input"
      value={selectedParticipantId}
      onChange={(e) => setSelectedParticipantId(e.target.value)}
    >
      {competitionParticipants.map((participant) => (
        <option key={participant.id} value={participant.id}>
          {participant.name}
        </option>
      ))}
    </select>
  </div>
) : null}

                  <div>
                    <label className="label">Round filter</label>
                    <select
                      className="input"
                      value={selectedRound}
                      onChange={(e) => setSelectedRound(e.target.value)}
                    >
                      {rounds.map((round) => (
                        <option key={round} value={round}>
                          {round}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Tie-breaker: predicted champion</label>
                    <input
  className="input"
  placeholder="e.g. Brazil"
  value={effectiveChampionPick}
  disabled={isAdmin}
  onChange={async (e) => {
    if (isAdmin) return;
    await updateCurrentUserChampionPick(e.target.value);
  }}
/>
                  </div>

                  <div className="info-box">
  {effectiveLockPredictions
    ? "Predictions lock automatically at kickoff."
    : "Prediction locking is currently disabled."}
</div>

<div className="info-box">
  Your predictions are saved automatically.
</div>

{saveNotice ? (
  <div className="success-box">
    {saveNotice}
  </div>
) : null}

</div>
</Panel>

              <Panel
  title={
    isAdmin
      ? `Predictions — ${selectedParticipant?.name || "Participant"}`
      : "My Predictions"
  }
>
<div className="stack-12">
  {filteredMatches.length === 0 ? (
    <div className="info-box">
      No matches available for this round yet.
    </div>
  ) : (
    filteredMatches.map((match) => {
                    const currentPick =
                    effectivePredictions[selectedParticipantId]?.[match.id] || "";
                    const locked = isLocked(match);
                    const editingDisabled = isAdmin || locked;

                    return (
                      <div key={match.id} className="match-card">
                        <div className="match-header">
                          <div>
                            <div className="match-round">{match.round}</div>
                            <div className="match-title">
                              {match.home} vs {match.away}
                            </div>
                            <div className="match-kickoff">{formatDateTime(match.kickoff)}</div>
                            <div className="match-kickoff">{getKickoffCountdown(match)}</div>
                          </div>

                          <StatusBadge
                            tone={locked ? "slate" : "green"}
                            text={locked ? "Locked" : "Open"}
                          />
                        </div>

                        <div className="button-row-wrap">
                          {["1", "X", "2"].map((option) => (
                            <button
                              key={option}
                              className={`btn-outcome ${
                                currentPick === option ? "btn-outcome-dark-active" : ""
                              } ${editingDisabled ? "btn-disabled" : ""}`}
                              disabled={editingDisabled}
                              onClick={() =>
                                updatePrediction(selectedParticipantId, match.id, option)
                              }
                            >
                              {option}
                            </button>
                          ))}
                        </div>

                        {allowsScorePrediction(match) ? (
  <div className="score-prediction-panel">
    <div className="score-prediction-title">
      Exact score prediction
    </div>

    <div className="score-prediction-row">
      <input
        className="score-input"
        type="number"
        min="0"
        placeholder={match.home}
        disabled={editingDisabled}
        value={scorePredictions[String(match.id)]?.home || ""}
        onChange={(e) =>
          setScorePredictions((prev) => ({
            ...prev,
            [String(match.id)]: {
              home: e.target.value,
              away: prev[String(match.id)]?.away || "",
            },
          }))
        }
      />

      <span className="score-separator">:</span>

      <input
        className="score-input"
        type="number"
        min="0"
        placeholder={match.away}
        disabled={editingDisabled}
        value={scorePredictions[String(match.id)]?.away || ""}
        onChange={(e) =>
          setScorePredictions((prev) => ({
            ...prev,
            [String(match.id)]: {
              home: prev[String(match.id)]?.home || "",
              away: e.target.value,
            },
          }))
        }
      />

      <button
        className="btn-primary"
        disabled={editingDisabled}
        onClick={() => updateScorePrediction(match.id)}
      >
        Save score
      </button>
    </div>

    <div className="score-prediction-help">
      Exact score bonus: 3 points
    </div>
  </div>
) : null}

                        <div className="match-result-text">
                          Current prediction:{" "}
                          <strong>{outcomeLabel(currentPick, match)}</strong>
                        </div>

                        {match.result ? (
                          <div className="match-result-text">
                            Actual result:{" "}
                            <strong>{outcomeLabel(match.result, match)}</strong>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                  )}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "matrix" && (
            <div className="grid-1">
              <Panel title="Prediction matrix">
                <div className="toolbar-between">
                  <div className="small-muted">
                    Sticky matrix layout for easier cross-checking across participants and matches.
                  </div>

                  <div className="toolbar-wrap">
                    <select
                      className="input input-small"
                      value={selectedRound}
                      onChange={(e) => setSelectedRound(e.target.value)}
                    >
                      {rounds.map((round) => (
                        <option key={round} value={round}>
                          {round}
                        </option>
                      ))}
                    </select>

                    <button className="btn-secondary" onClick={exportPredictionsCsv}>
                      Export CSV
                    </button>
                  </div>
                </div>

                {filteredMatches.length === 0 || competitionParticipants.length === 0 ? (
  <div className="info-box">
    No matrix data available yet — add matches and participant predictions to see the comparison view.
  </div>
) : (
  <div className="matrix-wrap">
    <table className="matrix-table">
                    <thead>
                      <tr>
                        <th className="sticky-col sticky-head matrix-left-head">
                          Participant
                        </th>
                        {filteredMatches.map((match) => (
                          <th key={match.id} className="sticky-head matrix-head-cell">
                            <div className="matrix-head-title">
                              {match.home} vs {match.away}
                            </div>
                            <div className="matrix-head-meta">{match.round}</div>
                            <div className="matrix-head-meta">{formatDateTime(match.kickoff)}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                    {competitionParticipants.map((participant) => (
                        <tr key={participant.id}>
                          <td className="sticky-col matrix-participant-cell">
                            <div className="matrix-participant-name">
                              {participant.name}
                            </div>
                            <div className="matrix-participant-meta">
                              {participant.email || "No email"}
                            </div>
                          </td>

                          {filteredMatches.map((match) => {
  const pick =
    effectiveAllPredictions[String(participant.id)]?.[String(match.id)] || "";

    const scorePick =
    effectiveAllScorePredictions?.[String(participant.id)]?.[String(match.id)];
  
  const scoreText =
    scorePick &&
    scorePick.home != null &&
    scorePick.away != null
      ? `${scorePick.home}-${scorePick.away}`
      : "";

  const correct = match.result && pick === match.result;

  return (
                              <td key={match.id} className="matrix-body-cell">
                                <div
                                  className={`matrix-box ${
                                    correct ? "matrix-box-correct" : ""
                                  }`}
                                >
<div className="matrix-pick">
  {outcomeBadge(pick, match)}
</div>

{scoreText && (
  <div className="matrix-score-pick">
    Score: {scoreText}
  </div>
)}

                                  {match.result ? (
                                    <div className="matrix-result-line">
                                      Result: {outcomeBadge(match.result, match)}
                                    </div>
                                  ) : (
                                    <div className="matrix-result-line muted">
                                      Result pending
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    </table>
</div>
)}
              </Panel>
            </div>
          )}

          {activeTab === "leaderboard" && (
            <div className="grid-2">
              <Panel title="🏆 Overall leaderboard">
                <div className="toolbar-between">
                  <div className="small-muted">
                    Transparent ranking ready for internal sharing.
                  </div>
                  <button className="btn-secondary" onClick={exportLeaderboardCsv}>
                    Export leaderboard CSV
                  </button>
                </div>

                {leaderboard.length === 0 ? (
  <div className="info-box">
    No leaderboard data yet — participants need to log in and submit predictions first.
  </div>
) : (
  <div className="table-wrap">
    <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Points</th>
                        <th>Correct Outcome</th>
                        <th>Correct Score</th>
                        <th>Champion</th>
                      </tr>
                    </thead>

                    <tbody>
                      {leaderboard.map((row, index) => (
                        <tr
                        key={row.id}
                        className={
                          String(row.id) === String(currentProfile?.id)
                            ? "leaderboard-current-user"
                            : ""
                        }
                      >
                          <td>{index + 1}</td>
                          <td>
                            <div className="table-name">{row.name}</div>
                            <div className="table-meta">{row.email || "No email"}</div>
                          </td>
                          <td className="td-strong">{row.points}</td>
<td>{row.hits}</td>
<td>{row.exactScores}</td>
<td>
                            {row.championPick}
                            {effectiveActualChampion && row.championHit === 1 ? (
  <div className="tie-break-hit">tie-break hit</div>
) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
</div>
)}
              </Panel>

              <Panel title="Tie-break and rounds">
              <label className="label">Official tournament champion</label>
                <input
  className="input"
  placeholder="Enter this when the tournament ends"
  value={effectiveActualChampion}
  disabled={!isAdmin}
  onChange={async (e) => {
    if (!isAdmin) return;
    await updateCompetitionSettings({
      actual_champion: e.target.value,
    });
  }}
/>

              </Panel>
            </div>
          )}

{activeTab === "rules" && (
  <div className="grid-1">
    <Panel title="Official rules">
      <div className="rule-list">
        {RULES.map((rule, index) => (
          <div key={index} className="rule-item">
            <div className="rule-index">{index + 1}</div>
            <div style={{ whiteSpace: "pre-line" }}>
  {rule}
</div>
          </div>
        ))}
      </div>
    </Panel>
  </div>
)}

          {activeTab === "communications" && (
            <div className="grid-2-wide">
              <Panel title="Daily summary for Teams or email">
                <div className="toolbar-wrap">
                  <button className="btn-primary" onClick={generateAndCopySummary}>
                    Generate and copy summary
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setSummaryText(generateDailySummaryText())}
                  >
                    Generate summary only
                  </button>
                </div>

                {summaryCopied ? (
                  <div className="success-box">
                    Summary copied to clipboard and ready to paste into Teams or email.
                  </div>
                ) : null}

                <textarea
                  className="input textarea large-textarea"
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="Generate a daily summary here."
                />
              </Panel>

              <Panel title="Summary contents">
                <div className="stack-10">
                  <div className="mini-stat">Top 5 leaderboard</div>
                  <div className="mini-stat">Latest completed matches</div>
                  <div className="mini-stat">Next open match</div>
                  <div className="mini-stat">Completed match count</div>
                  <div className="mini-stat">Total prediction entries</div>
                </div>

                <div className="section-top-gap info-box">
                  Recommendation: post one update per day in Teams to keep engagement
                  high throughout the tournament.
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "admin" && (
            <div className="grid-2">
              <Panel title="Competition settings">
                <div className="stack-14">
                  <div>
                    <label className="label">Competition name</label>
<input
  className="input"
  value={effectiveCompetitionName}
  onChange={async (e) => {
    await updateCompetitionSettings({
      competition_name: e.target.value,
    });
  }}
/>
                  </div>

                  <div>
                    <label className="label">Points per correct outcome</label>
                    <input
  className="input"  className="input"
  min="1"
  value={effectivePointsPerHit}
  onChange={async (e) => {
    await updateCompetitionSettings({
      points_per_hit: Math.max(1, Number(e.target.value) || 1),
    });
  }}
/>

                  </div>

                  <label className="toggle-row">
                  <input
  type="checkbox"
  checked={effectiveLockRegistration}
  onChange={async (e) => {
    await updateCompetitionSettings({
      registration_locked: e.target.checked,
    });
  }}
/>
                    <span>
                      <strong>Lock registration</strong>
                      <div className="toggle-meta">
                        When enabled, participants can no longer be added or removed.
                      </div>
                    </span>
                  </label>

                  <label className="toggle-row">
                  <input
  type="checkbox"
  checked={effectiveLockPredictions}
  onChange={async (e) => {
    await updateCompetitionSettings({
      prediction_lock_enabled: e.target.checked,
    });
  }}
/>
                    <span>
                      <strong>Lock predictions at kickoff</strong>
                      <div className="toggle-meta">
                        When enabled, predictions can no longer be changed after the
                        match starts.
                      </div>
                    </span>
                  </label>
                </div>
              </Panel>

              <Panel title="Admin actions">
                <div className="stack-14">
                  <div className="info-box">
                    <strong>Scoring summary</strong>
                    <div style={{ marginTop: 8 }}>
                      1 point for a correct outcome, 0 for an incorrect outcome.
                      Only 1 / X / 2 predictions count, based on regular 90 minutes.
                    </div>
                  </div>

                  <div className="info-box">
                    <strong>Operational tips</strong>
                    <div style={{ marginTop: 8 }}>
                      Lock registration before the first match, import all matches
                      upfront, and assign one admin to enter final results.
                    </div>
                  </div>

                  <div className="toolbar-wrap">
                    <button className="btn-secondary" onClick={exportLeaderboardCsv}>
                      Export leaderboard CSV
                    </button>
                    <button className="btn-secondary" onClick={exportPredictionsCsv}>
                      Export predictions CSV
                    </button>
                  </div>

                  <button className="btn-reset" onClick={resetCompetition}>
                    Reset competition
                  </button>

                  <div className="small-muted">
                    All data is saved in localStorage, so a browser refresh should not
                    remove your changes.
                  </div>
                </div>
              </Panel>
            </div>
          )}

          <div className="app-credit">
            Built by Sadmir Sivic
          </div>
      
        </div>
      </div>
      </>
      );
      }

const css = `
  * { box-sizing: border-box; }

  body {
    margin: 0;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.06), transparent 25%),
      radial-gradient(circle at top right, rgba(16, 185, 129, 0.05), transparent 22%),
      linear-gradient(180deg, #f6f8fb 0%, #eef3f8 100%);
    color: #0f172a;
    font-family: Arial, sans-serif;
  }

  .app-shell {
    min-height: 100vh;
    padding: 20px;
  }

  .app-container {
    max-width: 1420px;
    margin: 0 auto;
  }

  .dashboard-hero {
    display: grid;
    grid-template-columns: 1.5fr 0.95fr;
    gap: 20px;
    background:
      radial-gradient(circle at top right, rgba(255,255,255,0.09), transparent 28%),
      linear-gradient(135deg, #0f172a 0%, #172554 55%, #166534 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 30px;
    padding: 30px;
    margin-bottom: 20px;
    color: white;
    box-shadow:
      0 24px 48px rgba(15, 23, 42, 0.14),
      0 8px 20px rgba(15, 23, 42, 0.06);
  }

  .dashboard-main {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }  

  .dashboard-badge {
    display: inline-flex;
    width: fit-content;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.14);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }

  .dashboard-title {
    margin: 0;
    font-size: 46px;
    line-height: 1.02;
    letter-spacing: -0.05em;
    color: white;
    max-width: 760px;
  }

  .dashboard-subtitle {
    margin: 4px 0 0;
    max-width: 620px;
    line-height: 1.72;
    color: rgba(255,255,255,0.82);
    font-size: 17px;
  }

  .dashboard-subtitle {
    margin: 4px 0 0;
    max-width: 620px;
    line-height: 1.72;
    color: rgba(255,255,255,0.82);
    font-size: 17px;
  }
  
  .dashboard-user-row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  
  .status-strip {
    display: grid;
    gap: 12px;
    margin-top: 10px;
  }

  .status-pill {
    border-radius: 18px;
    padding: 16px 16px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    backdrop-filter: blur(14px);
  }

  .status-pill-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.62);
    font-weight: 700;
  }

  .status-pill-value {
    margin-top: 8px;
    font-size: 16px;
    font-weight: 800;
    color: white;
    line-height: 1.35;
  }

  .dashboard-side {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 12px;
  }

  .stat-card {
    border-radius: 18px;
    border: 1px solid #cbd5e1;
    background: white;
    padding: 14px;
  }

  .stat-card-dark {
    border-radius: 20px;
    padding: 16px 16px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.10);
    box-shadow: none;
    min-height: 92px;
  }

  .stat-label,
  .stat-label-dark {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: rgba(255,255,255,0.64);
    font-weight: 700;
  }

  .stat-value-dark {
    margin-top: 8px;
    font-size: 22px;
    font-weight: 800;
    color: white;
    line-height: 1.1;
  }

  .stat-label {
    color: #64748b;
  }

  .stat-label-dark {
    color: rgba(255,255,255,0.72);
  }

  .stat-value {
    margin-top: 6px;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .top-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 20px;
  }

  .summary-card {
    background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
    border: 1px solid #e2e8f0;
    border-radius: 22px;
    padding: 20px;
    box-shadow:
      0 12px 24px rgba(15, 23, 42, 0.04),
      inset 0 1px 0 rgba(255,255,255,0.75);
  }

  .summary-label {
    color: #64748b;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 10px;
    font-weight: 700;
  }

  .summary-value {
    color: #0f172a;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .summary-value.small {
    font-size: 20px;
  }

  .summary-meta {
    color: #64748b;
    margin-top: 8px;
    line-height: 1.5;
    font-size: 13px;
  }

  .tabs-wrap {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #e2e8f0;
    border-radius: 24px;
    box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
  }

  .tab-btn {
    border: none;
    background: transparent;
    color: #64748b;
    font-weight: 700;
    font-size: 14px;
    padding: 12px 16px;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .tab-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .tab-btn-active {
    background: #f5f3ff;
    color: #6d28d9;
    box-shadow: inset 0 0 0 1px #ddd6fe;
  }

  .tab-btn:hover {
    background: #f8fafc;
    color: #334155;
  }

  .panel {
    background: rgba(255,255,255,0.96);
    border: 1px solid #e2e8f0;
    border-radius: 24px;
    padding: 22px;
    box-shadow:
      0 12px 28px rgba(15, 23, 42, 0.05),
      0 1px 3px rgba(15, 23, 42, 0.03);
  }

  .panel-title {
    color: #0f172a;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 16px;
  }

  .grid-1,
  .grid-2,
  .grid-2-wide,
  .grid-3,
  .grid-predictions {
    display: grid;
    gap: 16px;
  }

  .grid-1 { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid-2-wide { grid-template-columns: 1.4fr 0.8fr; }
  .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .grid-predictions { grid-template-columns: 320px 1fr; }

  .ordered-list {
    margin: 0;
    padding-left: 18px;
    line-height: 1.8;
  }

  .rule-list,
  .stack-8,
  .stack-10,
  .stack-12,
  .stack-14 {
    display: flex;
    flex-direction: column;
  }

  .stack-8 { gap: 8px; }
  .stack-10 { gap: 10px; }
  .stack-12 { gap: 14px; }
  .stack-14 { gap: 14px; }

  .rule-list { gap: 10px; }

  .rule-item,
  .rank-card,
  .round-card,
  .mini-stat,
  .list-row,
  .match-card {
    background: linear-gradient(180deg, #ffffff, #fafcff);
    border: 1px solid #e2e8f0;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
  }

  .rule-item {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
    align-items: start;
    border-radius: 16px;
    padding: 12px;
    line-height: 1.55;
  }

  .rule-index {
    color: #64748b;
    font-weight: 800;
  }

  .rank-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    border-radius: 18px;
    padding: 14px;
  }

  .rank-position {
    color: #64748b;
    font-size: 12px;
    margin-bottom: 4px;
  }

  .rank-name {
    font-size: 18px;
    font-weight: 800;
  }

  .rank-meta {
    color: #64748b;
    font-size: 12px;
    margin-top: 4px;
  }

  .rank-points-block {
    text-align: right;
  }

  .rank-points {
    font-size: 28px;
    font-weight: 800;
  }

  .form-grid-3,
  .form-grid-2 {
    display: grid;
    gap: 10px;
  }

  .form-grid-3 {
    grid-template-columns: 1fr 1fr auto;
    align-items: center;
  }

  .form-grid-2 {
    grid-template-columns: 1fr 1fr;
  }

  .input {
    width: 100%;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid #d7dee7;
    background: #fcfdff;
    font-size: 14px;
    outline: none;
    font-family: Arial, sans-serif;
    transition: all 0.18s ease;
  }

  .input:hover {
    border-color: #c7d2de;
  }

  .input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59,130,246,0.12);
  }

  .input-small {
    min-width: 120px;
    padding: 10px 12px;
    border-radius: 12px;
  }

  .textarea {
    min-height: 140px;
    resize: vertical;
    margin-top: 10px;
  }

  .large-textarea {
    min-height: 300px;
    margin-top: 12px;
  }

  .label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 700;
    color: #334155;
  }

  .list-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: 14px;
    border-radius: 18px;
  }

  .list-title {
    font-size: 16px;
    font-weight: 800;
  }

  .list-meta,
  .small-muted,
  .table-meta,
  .match-kickoff,
  .match-result-text {
    color: #64748b;
    font-size: 13px;
    line-height: 1.6;
  }

  .score-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  
  .score-input {
    width: 72px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #cbd5e1;
    font-size: 14px;
    box-sizing: border-box;
    background: white;
    color: #0f172a;
  }
  
  .score-separator {
    font-weight: 800;
    color: #334155;
  }
  
  .score-prediction-panel {
    margin-top: 12px;
    padding: 14px;
    border-radius: 18px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }
  
  .score-prediction-title {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 10px;
  }
  
  .score-prediction-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  
  .score-prediction-help {
    margin-top: 10px;
    font-size: 13px;
    color: #64748b;
    line-height: 1.45;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger,
  .btn-reset,
  .btn-outcome {
    border-radius: 14px;
    cursor: pointer;
    font-weight: 700;
    transition: all 0.18s ease;
    font-family: Arial, sans-serif;
  }

  .btn-primary {
    border: 1px solid #0f172a;
    background: linear-gradient(180deg, #0f172a, #111827);
    color: white;
    padding: 12px 16px;
    font-weight: 800;
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.16);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
  }

  .btn-secondary {
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.96);
    color: #1e293b;
    padding: 12px 16px;
    border-radius: 999px;
    font-weight: 800;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .btn-danger,
  .btn-reset {
    border: 1px solid #fecdd3;
    background: linear-gradient(180deg, #fff1f2, #ffe4e6);
    color: #b91c1c;
    padding: 10px 14px;
  }

  .btn-reset {
    width: fit-content;
    font-weight: 800;
  }

  .btn-primary:hover:not(.btn-disabled),
.btn-secondary:hover:not(.btn-disabled),
.btn-danger:hover:not(.btn-disabled),
.btn-reset:hover:not(.btn-disabled) {
  transform: translateY(-1px);
}

  .btn-outcome {
    border: 1px solid #d7dee7;
    background: white;
    color: #0f172a;
    padding: 10px 14px;
    min-width: 56px;
    font-weight: 800;
    transition: all 0.15s ease;
  }

  .btn-outcome:active {
    transform: scale(0.96);
  }

  .btn-outcome:hover:not(.btn-disabled) {
    transform: translateY(-1px);
  }

  .btn-outcome:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .btn-outcome-active {
    background: linear-gradient(180deg, #15803d, #166534);
    border-color: #166534;
    color: white;
    box-shadow: 0 8px 16px rgba(22, 101, 52, 0.18);
  }

  .btn-outcome-dark-active {
    background: linear-gradient(180deg, #0f172a, #111827);
    border-color: #0f172a;
    color: white;
    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.16);
  }

  .btn-disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .match-card {
    border-radius: 18px;
    padding: 16px;
  }

  .match-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }

  .match-round {
    font-size: 12px;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 6px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .match-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .button-row-wrap {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .info-box,
  .success-box {
    border-radius: 16px;
    padding: 14px;
    line-height: 1.6;
  }

  .info-box {
    background: linear-gradient(180deg, #fafcff, #f8fafc);
    border: 1px solid #e2e8f0;
    color: #334155;
  }

  .success-box {
    background: linear-gradient(180deg, #f0fdf4, #ecfdf5);
    border: 1px solid #bbf7d0;
    color: #166534;
    margin-top: 12px;
  }

  .toolbar-between,
  .toolbar-wrap {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  .toolbar-between {
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
  }

  .table th {
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
    color: #64748b;
    font-size: 13px;
    padding: 10px 12px;
    vertical-align: top;
    background: #fafcff;
  }

  .table td {
    border-bottom: 1px solid #f1f5f9;
    padding: 10px 12px;
    vertical-align: top;
    font-size: 14px;
    background: white;
  }

  .table tr:hover td {
    background: #fbfdff;
  }

  .leaderboard-current-user td {
    background: #eff6ff !important;
    border-bottom: 1px solid #bfdbfe;
  }

  .td-strong {
    font-size: 18px !important;
    font-weight: 800;
  }

  .table-name {
    font-weight: 800;
    margin-bottom: 4px;
  }

  .section-subtitle {
    font-size: 16px;
    font-weight: 800;
    margin-bottom: 10px;
  }

  .section-top-gap {
    margin-top: 24px;
  }

  .mt-12 { margin-top: 12px; }
  .mt-10 { margin-top: 10px; }

  .mini-stat {
    border-radius: 14px;
    padding: 10px 12px;
  }

  .round-card {
    border-radius: 16px;
    padding: 14px;
  }

  .round-title {
    font-weight: 800;
    margin-bottom: 10px;
  }

  .round-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .toggle-row {
    display: grid;
    grid-template-columns: 20px 1fr;
    gap: 12px;
    align-items: start;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    border-radius: 16px;
    padding: 14px;
  }

  .toggle-meta {
    margin-top: 6px;
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
  }

  .badge {
    display: inline-block;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 800;
    width: fit-content;
    border: 1px solid transparent;
  }

  .badge-green {
    background: #dcfce7;
    color: #166534;
    border-color: #bbf7d0;
  }

  .badge-amber {
    background: #fef3c7;
    color: #92400e;
    border-color: #fde68a;
  }

  .badge-slate {
    background: rgba(255,255,255,0.92);
    color: #1e293b;
    border: none;
    border-radius: 999px;
    padding: 12px 16px;
    font-weight: 700;
    font-size: 14px;
  }

  .tie-break-hit {
    margin-top: 6px;
    display: inline-block;
    background: #dcfce7;
    color: #166534;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 700;
  }

  .matrix-wrap {
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    background: white;
    box-shadow:
      0 12px 28px rgba(15, 23, 42, 0.04),
      inset 0 1px 0 rgba(255,255,255,0.7);
  }

  .matrix-table {
    border-collapse: separate;
    border-spacing: 0;
    min-width: 100%;
    width: max-content;
    background: white;
  }

  .matrix-table th,
  .matrix-table td {
    border-bottom: 1px solid #eef2f7;
    border-right: 1px solid #eef2f7;
    vertical-align: top;
    padding: 0;
    background: white;
  }

  .matrix-table tr:last-child td {
    border-bottom: none;
  }

  .matrix-head-cell {
    min-width: 220px;
    padding: 14px 14px 12px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9) !important;
  }

  .matrix-head-title {
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 6px;
    font-size: 13px;
    line-height: 1.4;
  }

  .matrix-head-meta {
    font-size: 11px;
    color: #64748b;
    line-height: 1.5;
  }

  .matrix-left-head {
    min-width: 220px;
    padding: 14px;
    background: linear-gradient(180deg, #f8fafc, #f1f5f9) !important;
    font-size: 13px;
    color: #334155;
    text-align: left;
    font-weight: 700;
    box-shadow: 6px 0 14px rgba(15, 23, 42, 0.04);
  }

  .matrix-participant-cell {
    min-width: 220px;
    padding: 14px;
    background: linear-gradient(180deg, #fcfdff, #f8fafc) !important;
    box-shadow: 6px 0 14px rgba(15, 23, 42, 0.03);
  }

  .matrix-participant-name {
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 4px;
    font-size: 14px;
  }

  .matrix-participant-meta {
    font-size: 12px;
    color: #64748b;
  }

  .matrix-body-cell {
    min-width: 220px;
    padding: 12px;
    background: white;
  }

  .matrix-box {
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 12px;
    background: linear-gradient(180deg, #fcfdff, #f8fafc);
    min-height: 86px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
  }

  .matrix-box-correct {
    background: linear-gradient(180deg, #ecfdf5, #dcfce7);
    border-color: #bbf7d0;
  }

  .matrix-pick {
    font-size: 15px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 6px;
  }

  .matrix-result-line {
    font-size: 11px;
    color: #475569;
    line-height: 1.5;
  }

  .matrix-result-line.muted {
    color: #94a3b8;
  }

  .sticky-head {
    position: sticky;
    top: 0;
    z-index: 3;
  }

  .sticky-col {
    position: sticky;
    left: 0;
    z-index: 2;
  }

  .matrix-left-head.sticky-col {
    z-index: 4;
  }

  .app-credit {
    margin-top: 28px;
    text-align: center;
    font-size: 12px;
    color: #64748b;
    padding-bottom: 8px;
    letter-spacing: 0.02em;
  }

  .overview-stack {
    display: grid;
    gap: 14px;
    margin-top: 12px;
  }
  
  .overview-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  
  .overview-feature-card,
  .overview-status-card {
    border-radius: 24px;
    padding: 20px;
    color: white;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
  }
  
  .overview-feature-card {
    min-height: 250px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 28px;
    padding: 24px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
  }
  
  .overview-feature-card-leader {
    background:
      radial-gradient(circle at top right, rgba(255,255,255,0.16), transparent 40%),
      linear-gradient(180deg, #101735 0%, #1e293b 100%);
  }
  
  .overview-feature-card-match {
    background:
      radial-gradient(circle at top right, rgba(255,255,255,0.14), transparent 40%),
      linear-gradient(180deg, #0f766e 0%, #14532d 100%);
  }
  
  .overview-status-card {
    background: rgba(255,255,255,0.98);
    color: #0f172a;
    border: 1px solid #e2e8f0;
    border-radius: 28px;
    padding: 24px;
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.10);
  }
  
  .overview-card-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 800;
    opacity: 0.8;
  }
  
  .overview-feature-title {
    margin-top: 18px;
    font-size: 32px;
    line-height: 1.08;
    font-weight: 800;
    letter-spacing: -0.04em;
  }
  
  .overview-feature-points {
    margin-top: 10px;
    font-size: 19px;
    color: rgba(255,255,255,0.82);
  }
  
  .overview-feature-meta {
    margin-top: 12px;
    font-size: 16px;
    color: rgba(255,255,255,0.84);
    line-height: 1.55;
  }
  
  .overview-ghost-button,
  .overview-primary-button {
    margin-top: 22px;
    border: none;
    border-radius: 18px;
    padding: 13px 16px;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.18s ease;
    background: rgba(255,255,255,0.96);
    color: #065f46;
    width: fit-content;
    box-shadow: 0 10px 20px rgba(255,255,255,0.08);
  }
  
  .overview-ghost-button {
    margin-top: 22px;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 18px;
    padding: 13px 16px;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.18s ease;
    background: rgba(255,255,255,0.08);
    color: white;
    width: fit-content;
  }
  
  .overview-primary-button {
    background: rgba(255,255,255,0.95);
    color: #065f46;
  }
  
  .overview-ghost-button:hover,
  .overview-primary-button:hover {
    transform: translateY(-1px);
    filter: brightness(1.02);
  }
  
  .overview-status-grid {
    margin-top: 18px;
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 20px;
    align-items: stretch;
  }
  
  .overview-progress-box {
    display: flex;
    align-items: center;
    gap: 20px;
    background: linear-gradient(180deg, #ffffff, #f8fafc);
    border: 1px solid #e2e8f0;
    border-radius: 24px;
    padding: 20px;
    min-height: 170px;
  }
  
  .overview-progress-ring {
    width: 116px;
    height: 116px;
    border-radius: 50%;
    background: conic-gradient(
      #22c55e 0deg,
      #22c55e calc(var(--overview-progress, 0) * 3.6deg),
      #e5e7eb calc(var(--overview-progress, 0) * 3.6deg),
      #e5e7eb 360deg
    );
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 6px rgba(255,255,255,0.7);
  }
  
  .overview-progress-ring-inner {
    width: 78px;
    height: 78px;
    border-radius: 50%;
    background: white;
    display: grid;
    place-items: center;
    font-weight: 800;
    color: #0f172a;
    font-size: 22px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
  }
  
  .overview-progress-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .overview-progress-value {
    font-size: 32px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.05;
    letter-spacing: -0.03em;
  }
  
  .overview-progress-label {
    font-size: 14px;
    color: #64748b;
    line-height: 1.5;
  }
  
  .overview-status-notes {
    display: grid;
    gap: 14px;
  }
  
  .overview-note-card {
    border-radius: 22px;
    padding: 18px;
    background: linear-gradient(180deg, #ffffff, #f8fafc);
    border: 1px solid #e2e8f0;
    min-height: 84px;
  }
  
  .overview-note-title {
    font-size: 14px;
    font-weight: 800;
    color: #0f172a;
  }
  
  .overview-note-text {
    margin-top: 8px;
    font-size: 14px;
    line-height: 1.6;
    color: #64748b;
  }
  
  .welcome-shell {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .welcome-intro {
    font-size: 15px;
    line-height: 1.7;
    color: #475569;
  }
  
  .welcome-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }
  
  .welcome-item {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 16px;
    border-radius: 20px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }
  
  .welcome-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #f1f5f9;
    font-size: 20px;
    flex-shrink: 0;
  }
  
  .welcome-item-title {
    font-size: 15px;
    font-weight: 800;
    color: #0f172a;
  }
  
  .welcome-item-text {
    margin-top: 6px;
    font-size: 14px;
    line-height: 1.6;
    color: #64748b;
  }
  
  .welcome-banner {
    border-radius: 18px;
    padding: 16px 18px;
    background: #ecfdf5;
    border: 1px solid #bbf7d0;
    color: #166534;
    font-weight: 700;
    line-height: 1.5;
  }

  @media (max-width: 860px) {
    .overview-grid-2,
    .overview-status-grid {
      grid-template-columns: 1fr;
    }
  
    .overview-progress-box {
      justify-content: flex-start;
    }
  }

  @media (max-width: 1160px) {
    .dashboard-hero,
    .top-summary,
    .grid-3,
    .grid-2,
    .grid-2-wide,
    .grid-predictions {
      grid-template-columns: 1fr;
    }

    .dashboard-side {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 820px) {
    .app-shell {
      padding: 14px;
    }

    .dashboard-hero {
      border-radius: 32px;
      padding: 30px 30px 22px;
    }

    .welcome-grid {
      grid-template-columns: 1fr;
    }

    .overview-feature-card,
  .overview-status-card {
    padding: 20px;
    border-radius: 24px;
  }

  .overview-feature-card {
    min-height: auto;
  }

  .overview-feature-title {
    font-size: 28px;
  }

  .overview-feature-points,
  .overview-feature-meta {
    font-size: 16px;
  }

  .overview-progress-box {
    flex-direction: column;
    align-items: flex-start;
  }

  .overview-progress-ring {
    width: 104px;
    height: 104px;
  }

  .overview-progress-ring-inner {
    width: 72px;
    height: 72px;
    font-size: 20px;
  }

  .overview-progress-value {
    font-size: 28px;
  }

  .overview-ghost-button,
  .overview-primary-button {
    width: 100%;
    justify-content: center;
  }

  .dashboard-user-row {
    gap: 10px;
  }

  .dashboard-user-row .btn-secondary,
  .dashboard-user-row .badge-slate {
    width: 100%;
    justify-content: center;
    text-align: center;
  }

  .score-prediction-row {
    align-items: stretch;
  }
  
  .score-prediction-row .score-input {
    flex: 1;
    min-width: 72px;
  }
  
  .score-prediction-row .btn-primary {
    width: 100%;
  }

    .dashboard-title {
      font-size: 32px;
    }

    .dashboard-side {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .top-summary {
      grid-template-columns: 1fr;
    }

    .summary-value {
      font-size: 24px;
    }

    .form-grid-3,
    .form-grid-2 {
      grid-template-columns: 1fr;
    }

    .tabs-wrap {
      gap: 6px;
    }

    .tab-btn {
      width: 100%;
    }
    .dashboard-main {
      gap: 14px;
    }
  
    .dashboard-side {
      gap: 10px;
      margin-top: 10px;
    }
  
    .overview-stack {
      gap: 12px;
      margin-top: 12px;
    }
  
    .tabs-wrap {
      margin-top: 14px;
      padding: 10px;
    }
  }
  `;