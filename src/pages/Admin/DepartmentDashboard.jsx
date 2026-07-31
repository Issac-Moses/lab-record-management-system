import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import AdminShell from "@/layouts/AdminShell";
import StatCard from "@/components/admin/StatCard";
import ChartCard from "@/components/admin/ChartCard";
import ShellCard from "@/components/admin/ShellCard";
import StudentCard from "@/components/admin/StudentCard";
import DataTable from "@/components/admin/DataTable";
import ExamMatrixGrid from "@/components/admin/ExamMatrixGrid";
import SubmissionReviewPanel from "@/components/admin/SubmissionReviewPanel";
import EmptyState from "@/components/admin/EmptyState";
import FadeSwitch from "@/components/admin/FadeSwitch";
import { getDepartmentDashboardData } from "@/services/adminDataService";

export default function DepartmentDashboard() {
  const { department } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getDepartmentDashboardData(decodeURIComponent(department || ""))
      .then((result) => {
        if (alive) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("DepartmentDashboard error:", err);
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [department]);

  const stats = useMemo(
    () => [
      { label: "Students", value: data?.stats?.students || 0, delta: 0, color: "blue", trend: [] },
      { label: "Faculty", value: data?.stats?.faculty || 0, delta: 0, color: "violet", trend: [] },
      { label: "Subjects", value: data?.stats?.subjects || 0, delta: 0, color: "emerald", trend: [] },
    ],
    [data]
  );

  const statsSkeleton = (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, idx) => (
        <ShellCard key={`dept-stat-skeleton-${idx}`}>
          <div className="space-y-3">
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="faculty-shimmer h-12 w-full animate-pulse rounded bg-slate-100" />
          </div>
        </ShellCard>
      ))}
    </div>
  );

  const topStudentsSkeleton = (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={`top-student-skeleton-${idx}`} className="faculty-shimmer h-12 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </div>
  );

  const studentGridSkeleton = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={`dept-student-skeleton-${idx}`} className="faculty-shimmer h-52 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ))}
    </div>
  );

  const facultySkeleton = (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={`faculty-skeleton-${idx}`} className="faculty-shimmer h-10 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ))}
    </div>
  );

  const subjectsSkeleton = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={`subject-skeleton-${idx}`} className="faculty-shimmer h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ))}
    </div>
  );

  const matrixSkeleton = (
    <div className="space-y-3">
      <div className="faculty-shimmer h-10 animate-pulse rounded-xl border border-slate-200 bg-white" />
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={`matrix-skeleton-${idx}`} className="faculty-shimmer h-8 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </div>
  );

  return (
    <AdminShell title={`${data?.department || "Department"} Dashboard`}>
      <div className="col-span-12">
        <Tabs.Root defaultValue="overview" className="space-y-4">
          <Tabs.List className="grid gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2 md:grid-cols-5">
            {["overview", "people", "subjects", "matrix", "analytics"].map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="rounded-xl px-3 py-2 text-sm capitalize text-slate-600 transition data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                {tab === "matrix" ? "Exam Matrix" : tab}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* Overview Tab */}
          <Tabs.Content value="overview" className="space-y-4">
            <FadeSwitch loading={loading} skeleton={statsSkeleton}>
              <div className="grid gap-4 md:grid-cols-3">
                {stats.map((stat) => (
                  <StatCard key={stat.label} {...stat} />
                ))}
              </div>
            </FadeSwitch>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ChartCard
                  title="Submission Trend"
                  type="area"
                  data={data?.trend || []}
                  emptyTitle="No submissions yet"
                  emptyDescription="Submission trend will appear once students submit experiments."
                  loading={loading}
                />
              </div>
              <ShellCard title="Top Students">
                <FadeSwitch loading={loading} skeleton={topStudentsSkeleton}>
                  {(data?.students || []).length > 0 ? (
                    <div className="space-y-2">
                      {(data?.students || []).slice(0, 8).map((student) => (
                        <div key={student.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <p className="text-sm text-slate-800">{student.name}</p>
                          <p className="text-xs text-slate-500">Avg grade {Math.round(student.avgGrade || 0)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No students in this department"
                      description="Top student list will appear after students are assigned to this department."
                    />
                  )}
                </FadeSwitch>
              </ShellCard>
            </div>
          </Tabs.Content>

          {/* People Tab */}
          <Tabs.Content value="people" className="space-y-4">
            <ShellCard title="Students">
              <FadeSwitch loading={loading} skeleton={studentGridSkeleton}>
                {(data?.students || []).length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(data?.students || []).map((student) => (
                      <StudentCard key={student.id} student={student} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No students in this department"
                    description="Add or assign students to this department to populate the student grid."
                  />
                )}
              </FadeSwitch>
            </ShellCard>
            <ShellCard title="Faculty">
              <FadeSwitch loading={loading} skeleton={facultySkeleton}>
                {(data?.faculty || []).length > 0 ? (
                  <DataTable
                    columns={[
                      { key: "name", label: "Name" },
                      { key: "assigned", label: "Assigned Subjects" },
                    ]}
                    data={data?.faculty || []}
                  />
                ) : (
                  <EmptyState
                    title="No faculty in this department"
                    description="Faculty list will appear after faculty members are assigned to this department."
                  />
                )}
              </FadeSwitch>
            </ShellCard>
          </Tabs.Content>

          {/* Subjects Tab */}
          <Tabs.Content value="subjects">
            <ShellCard title="Subjects">
              <FadeSwitch loading={loading} skeleton={subjectsSkeleton}>
                {(data?.subjects || []).length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(data?.subjects || []).map((subject) => (
                      <div key={subject.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="font-semibold text-slate-800">{subject.name}</p>
                        <p className="text-xs text-slate-500">Code: {subject.code}</p>
                        <p className="mt-1 text-xs text-slate-500">Year {subject.year} · Sem {subject.semester}</p>
                        <p className="text-xs text-slate-500">{subject.experiments} experiments</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No subjects in this department"
                    description="Subject cards appear after subjects are created and mapped to this department."
                  />
                )}
              </FadeSwitch>
            </ShellCard>
          </Tabs.Content>

          {/* Exam Matrix Tab */}
          <Tabs.Content value="matrix" className="space-y-4">
            <ShellCard title="Exam Matrix">
              <FadeSwitch loading={loading} skeleton={matrixSkeleton}>
                {(data?.matrix || []).length > 0 && (data?.experiments || []).length > 0 ? (
                  <>
                    <ExamMatrixGrid
                      experiments={data?.experiments || []}
                      rows={data?.matrix || []}
                      onCellClick={(row, cell) => {
                        setReviewData({
                          studentName: row.studentName,
                          experiment: cell.experiment,
                          score: cell.score,
                        });
                        setReviewOpen(true);
                      }}
                    />
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">&gt;=75</span>
                      <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">50-74</span>
                      <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">&lt;50</span>
                      <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Pending</span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">Not submitted</span>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="No matrix data available"
                    description="Exam matrix appears after students, experiments, and submissions are available."
                  />
                )}
              </FadeSwitch>
            </ShellCard>
          </Tabs.Content>

          {/* Analytics Tab */}
          <Tabs.Content value="analytics" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="Grade Distribution"
                type="bar"
                data={data?.gradeDistribution || []}
                dataKey="count"
                xKey="bucket"
                colors={["#22d3ee"]}
                emptyTitle="No graded submissions"
                emptyDescription="Grade distribution appears after faculty grade submissions."
                loading={loading}
              />
              <ChartCard
                title="Submission Trend"
                type="line"
                data={data?.trend || []}
                colors={["#a855f7"]}
                emptyTitle="No submission trend"
                emptyDescription="Trend chart appears after submission activity is recorded."
                loading={loading}
              />
            </div>
            <ChartCard
              title="Experiment Difficulty (avg grade vs time)"
              type="line"
              data={data?.difficulty || []}
              dataKey="avgGrade"
              xKey="experiment"
              colors={["#34d399"]}
              emptyTitle="No difficulty data available"
              emptyDescription="Difficulty chart appears after multiple graded attempts per experiment."
              loading={loading}
            />
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <SubmissionReviewPanel
        open={reviewOpen}
        data={reviewData}
        onClose={() => setReviewOpen(false)}
        onSave={() => setReviewOpen(false)}
      />
    </AdminShell>
  );
}
