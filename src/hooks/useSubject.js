import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getSelectedSubjectFromStorage,
  setSelectedSubjectInStorage,
  useSelectedSubject,
} from "@/context/SubjectContext";

export default function useSubject() {
  const [searchParams, setSearchParams] = useSearchParams();
  const querySubjectId = searchParams.get("subject");
  const querySubjectName = searchParams.get("subjectName");
  const stored = getSelectedSubjectFromStorage();
  const { selectedSubjectId, selectedSubjectName } = useSelectedSubject();

  const subjectId = querySubjectId || selectedSubjectId || stored.subjectId || null;
  const subjectName = querySubjectName || selectedSubjectName || stored.subjectName || "";

  const setSubject = useMemo(
    () => (nextId, nextName = "") => {
      if (!nextId) return;
      setSelectedSubjectInStorage(nextId, nextName);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("subject", nextId);
      if (nextName) nextParams.set("subjectName", nextName);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return {
    id: subjectId,
    name: subjectName,
    selectedSubjectId,
    selectedSubjectName,
    setSubject,
  };
}
