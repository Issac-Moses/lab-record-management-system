

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ================= TYPES ================= */

export type ExperimentPDFData = {
  studentName: string;
  registerNo: string;
  department: string;
  collegeName: string;
  subject: string;
  experimentNo: string;
  experimentTitle: string;
  aim: string;
  procedure: string;
  output: string;
  result: string;
  images?: string[]; // base64 image URLs
  facultyName?: string;
  marks?: number;
};

/* ================= ENGINE ================= */

export function generateLabManualPDF(data: ExperimentPDFData) {
  const doc = new jsPDF("p", "mm", "a4");

  /* ================= HEADER ================= */
  doc.setFontSize(16);
  doc.text(data.collegeName, 105, 15, { align: "center" });

  doc.setFontSize(12);
  doc.text("DEPARTMENT OF " + data.department.toUpperCase(), 105, 22, {
    align: "center",
  });

  doc.setFontSize(13);
  doc.text("DIGITAL LAB RECORD SYSTEM", 105, 30, { align: "center" });

  doc.line(10, 34, 200, 34);

  /* ================= STUDENT INFO ================= */
  autoTable(doc, {
    startY: 40,
    theme: "grid",
    styles: { fontSize: 10 },
    body: [
      ["Student Name", data.studentName, "Register No", data.registerNo],
      ["Subject", data.subject, "Experiment No", data.experimentNo],
    ],
  });

  let y = (doc as any).lastAutoTable.finalY + 10;

  /* ================= EXPERIMENT CONTENT ================= */

  const section = (title: string, content: string) => {
    doc.setFontSize(13);
    doc.text(title, 10, y);
    y += 6;

    doc.setFontSize(11);
    const text = doc.splitTextToSize(content || "-", 180);
    doc.text(text, 10, y);
    y += text.length * 6 + 6;
  };

  section("Aim", data.aim);
  section("Procedure", data.procedure);
  section("Output", data.output);
  section("Result", data.result);

  /* ================= IMAGES ================= */
  if (data.images && data.images.length > 0) {
    doc.setFontSize(13);
    doc.text("Output Images", 10, y);
    y += 6;

    data.images.forEach((img) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }

      doc.addImage(img, "JPEG", 30, y, 150, 80);
      y += 90;
    });
  }

  /* ================= FOOTER ================= */
  if (data.marks !== undefined) {
    autoTable(doc, {
      startY: y + 10,
      theme: "grid",
      styles: { fontSize: 10 },
      body: [
        ["Faculty Name", data.facultyName || "___________"],
        ["Marks Awarded", String(data.marks)],
        ["Faculty Signature", "_____________________"],
      ],
    });
  }

  /* ================= PAGE NUMBER ================= */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
  }

  /* ================= DOWNLOAD ================= */
  doc.save(
    `Exp-${data.experimentNo}-${data.studentName.split(" ").join("_")}.pdf`
  );

}