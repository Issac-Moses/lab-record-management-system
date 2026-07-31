import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Save, FlaskConical } from "lucide-react";


export default function LabForm() {
  const [form, setForm] = useState({
    experiment_no: "",
    experiment_title: "",
    aim: "",
    procedure: "",
    program: "",
    output: "",
    result: "",
  });

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!form.experiment_no || !form.experiment_title) {
      alert("Experiment number and title are required");
      return;
    }

    const { error } = await supabase.from("submissions").insert([
      {
        experiment_no: Number(form.experiment_no),
        experiment_title: form.experiment_title,
        aim: form.aim,
        procedure: form.procedure,
        program: form.program,
        output: form.output,
        result: form.result,
        status: "draft",
      },
    ]);

    if (error) {
      console.error(error);
      alert("Save failed");
    } else {
      alert("Saved successfully");
      setForm({
        experiment_no: "",
        experiment_title: "",
        aim: "",
        procedure: "",
        program: "",
        output: "",
        result: "",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-blue-600/10 text-blue-400">
          <FlaskConical className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-semibold text-white">
          Experiment Details
        </h2>
      </div>

      {/* Inputs */}
      <div className="grid md:grid-cols-2 gap-4">
        <InputField
          name="experiment_no"
          placeholder="Experiment No"
          value={form.experiment_no}
          onChange={handleChange}
        />

        <InputField
          name="experiment_title"
          placeholder="Experiment Title"
          value={form.experiment_title}
          onChange={handleChange}
        />
      </div>

      <TextAreaField
        name="aim"
        placeholder="Aim of the Experiment"
        value={form.aim}
        onChange={handleChange}
      />

      <TextAreaField
        name="procedure"
        placeholder="Procedure"
        value={form.procedure}
        onChange={handleChange}
      />

      <TextAreaField
        name="program"
        placeholder="Program / Code"
        value={form.program}
        onChange={handleChange}
      />

      <div className="grid md:grid-cols-2 gap-4">
        <TextAreaField
          name="output"
          placeholder="Output"
          value={form.output}
          onChange={handleChange}
        />

        <TextAreaField
          name="result"
          placeholder="Result"
          value={form.result}
          onChange={handleChange}
        />
      </div>

      {/* Save Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium shadow-lg transition"
      >
        <Save className="w-4 h-4" />
        Save Draft
      </motion.button>
    </motion.div>
  );
}

/* ================= UI COMPONENTS ================= */

function InputField({ name, placeholder, value, onChange }: any) {
  return (
    <input
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-white outline-none focus:border-blue-500/60 transition"
    />
  );
}

function TextAreaField({ name, placeholder, value, onChange }: any) {
  return (
    <textarea
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={3}
      className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-white outline-none focus:border-blue-500/60 transition resize-none"
    />
  );
}