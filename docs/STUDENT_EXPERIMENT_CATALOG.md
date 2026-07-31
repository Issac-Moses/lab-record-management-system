# Student experiment titles and numbers

Student-facing pages read the **live** faculty catalog from the **`experiments`** table (title, `experiment_no`, `due_date`), joined with each student’s `student_experiments` and `submissions` rows.

They **do not** rely on the `full_student_data` view for the experiment list, so:

- New labs from **Add Experiment** or **bulk upload** appear as soon as rows exist in `experiments`.
- **Title / number / deadline** edits under **Faculty → Experiments** show to students after they **refresh**, switch back to the tab (visibility refetch), or navigate again.

Admin/faculty views that still use `full_student_data` for analytics are unchanged.
