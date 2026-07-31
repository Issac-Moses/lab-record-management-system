import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

interface Subject {
  id: string;
  name: string;
  code?: string;
  credits?: number;
  semester?: string;
  year?: string;
  department?: string;
}

interface SubjectContextType {
  subjects: Subject[];
  loading: boolean;
  error: string | null;
  department: string | null;
  year: string | null;
  semester: string | null;
  refetch: () => Promise<void>;
}

const SubjectContext = createContext<SubjectContextType | undefined>(
  undefined
);

const SUBJECT_ID_KEYS = [
  "student_subject_id",
  "selected_subject_id",
  "studentSelectedSubjectId",
  "selectedSubjectId",
];
const SUBJECT_NAME_KEYS = [
  "student_subject_name",
  "selected_subject_name",
  "studentSelectedSubjectName",
  "selectedSubjectName",
];

function normalizeDepartmentKey(value: string | null | undefined): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const compact = normalized.replace(/\s+/g, "");
  const aliases: Record<string, string> = {
    it: "information technology",
    informationtechnology: "information technology",
    aids: "artificial intelligence and data science",
    artificialintelligenceanddatascience: "artificial intelligence and data science",
    artificialintelligencedatascience: "artificial intelligence and data science",
  };
  return aliases[compact] || normalized;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseRomanNumeral(value: string): number | null {
  const roman = value.toUpperCase().trim();
  if (!roman) return null;
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  let prev = 0;
  for (let i = roman.length - 1; i >= 0; i -= 1) {
    const current = map[roman[i]];
    if (!current) return null;
    if (current < prev) total -= current;
    else total += current;
    prev = current;
  }
  return total > 0 ? total : null;
}

function normalizeAcademicNumber(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";

  const directNumber = raw.match(/\d+/)?.[0];
  if (directNumber) return String(parseInt(directNumber, 10));

  const wordsMap: Record<string, string> = {
    first: "1",
    second: "2",
    third: "3",
    fourth: "4",
    fifth: "5",
    sixth: "6",
    seventh: "7",
    eighth: "8",
  };
  const wordKey = Object.keys(wordsMap).find((key) => raw.includes(key));
  if (wordKey) return wordsMap[wordKey];

  const romanCandidate = raw.replace(/[^ivxlcdm]/gi, "");
  const romanValue = parseRomanNumeral(romanCandidate);
  if (romanValue) return String(romanValue);

  return raw.replace(/\s+/g, " ");
}

function normalizeYearKey(value: unknown): string {
  return normalizeAcademicNumber(String(value ?? "").replace(/\byear\b/gi, ""));
}

function normalizeSemesterKey(value: unknown): string {
  return normalizeAcademicNumber(String(value ?? "").replace(/\bsem(?:ester)?\b/gi, ""));
}

function getFirstStorageValue(keys: string[]): string | null {
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }
  return null;
}

function migrateLegacySubjectStorage() {
  const subjectId = getFirstStorageValue(SUBJECT_ID_KEYS);
  const subjectName = getFirstStorageValue(SUBJECT_NAME_KEYS) || "";
  if (!subjectId) return;
  setSelectedSubjectInStorage(subjectId, subjectName);
}

export function getSelectedSubjectFromStorage() {
  migrateLegacySubjectStorage();
  const urlParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const urlSubjectId = urlParams?.get("subject");
  const urlSubjectName = urlParams?.get("subjectName");

  if (urlSubjectId) {
    const resolvedName = urlSubjectName || getFirstStorageValue(SUBJECT_NAME_KEYS) || "";
    setSelectedSubjectInStorage(urlSubjectId, resolvedName);
    return {
      subjectId: urlSubjectId,
      subjectName: resolvedName,
    };
  }

  return {
    subjectId: getFirstStorageValue(SUBJECT_ID_KEYS),
    subjectName: getFirstStorageValue(SUBJECT_NAME_KEYS),
  };
}

export function setSelectedSubjectInStorage(subjectId: string, subjectName: string) {
  localStorage.setItem("student_subject_id", subjectId);
  localStorage.setItem("student_subject_name", subjectName);

  // Keep compatibility with older keys until all code paths are migrated.
  localStorage.setItem("selected_subject_id", subjectId);
  localStorage.setItem("selected_subject_name", subjectName);
  localStorage.setItem("studentSelectedSubjectId", subjectId);
  localStorage.setItem("studentSelectedSubjectName", subjectName);
  localStorage.setItem("selectedSubjectId", subjectId);
  localStorage.setItem("selectedSubjectName", subjectName);
}

export function clearSelectedSubjectInStorage() {
  for (const key of SUBJECT_ID_KEYS) {
    localStorage.removeItem(key);
  }
  for (const key of SUBJECT_NAME_KEYS) {
    localStorage.removeItem(key);
  }
}

export function SubjectProvider({ children }: { children: ReactNode }) {
  const STUDENT_SUBJECTS_ERROR =
    "Unable to load subjects right now. Please try again in a moment.";
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [semester, setSemester] = useState<string | null>(null);

  async function fetchSubjects() {
    try {
      setLoading(true);
      setError(null);

      // 1️⃣ Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setError(STUDENT_SUBJECTS_ERROR);
        setLoading(false);
        return;
      }

      if (!user) {
        setSubjects([]);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("department, year, semester")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setError(STUDENT_SUBJECTS_ERROR);
        setSubjects([]);
        setLoading(false);
        return;
      }

      const selectedDepartment = profile?.department || null;
      const selectedYear = profile?.year || null;
      const selectedSemester = profile?.semester || null;

      setDepartment(selectedDepartment);
      setYear(selectedYear);
      setSemester(selectedSemester);

      const { data: subjectsData, error: subjectsError } = await supabase
        .from("subjects")
        .select("id, name, code, credits, semester, year, department")
        .order("name", { ascending: true });

      if (subjectsError) {
        setError(STUDENT_SUBJECTS_ERROR);
        setSubjects([]);
      } else if (subjectsData) {
        const targetDepartment = normalizeDepartmentKey(selectedDepartment);
        const targetYear = normalizeYearKey(selectedYear);
        const targetSemester = normalizeSemesterKey(selectedSemester);

        const filtered = (subjectsData as Subject[]).filter((item) => {
          const departmentMatch =
            !targetDepartment ||
            normalizeDepartmentKey(item.department) === targetDepartment;
          const subjectYear = normalizeYearKey(item.year);
          const subjectSemester = normalizeSemesterKey(item.semester);
          const yearMatch = !targetYear || !subjectYear || subjectYear === targetYear;
          const semesterMatch =
            !targetSemester || !subjectSemester || subjectSemester === targetSemester;
          return departmentMatch && yearMatch && semesterMatch;
        });

        setSubjects(filtered);
      }
    } catch (err) {
      setError(STUDENT_SUBJECTS_ERROR);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSubjects();
  }, []);

  return (
    <SubjectContext.Provider
      value={{
        subjects,
        loading,
        error,
        department,
        year,
        semester,
        refetch: fetchSubjects,
      }}
    >
      {children}
    </SubjectContext.Provider>
  );
}

export function useSubjects() {
  const context = useContext(SubjectContext);
  if (!context) {
    throw new Error("useSubjects must be used inside SubjectProvider");
  }
  return context;
}

export function useSelectedSubject() {
  const { subjectId, subjectName } = getSelectedSubjectFromStorage();
  return {
    subjectId,
    subjectName,
    selectedSubjectId: subjectId,
    selectedSubjectName: subjectName,
  };
}
