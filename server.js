const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const Admin = require("./models/Admin");
const Student = require("./models/student"); // file: student.js (lowercase)
const Attendance = require("./models/Attendance");
const Notice = require("./models/Notice");

dotenv.config();

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "erpsecret",
    resave: false,
    saveUninitialized: false,
  })
);

// auth middleware
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.redirect("/login");
  next();
}

// create default admin
async function ensureAdmin() {
  const exists = await Admin.findOne({ username: "admin" });
  if (!exists) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await Admin.create({ username: "admin", passwordHash });
    console.log("Default admin created: admin / admin123");
  }
}

// DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((e) => console.log("Mongo error:", e));

// ----- ADMIN SIGNUP -----
app.get("/signup", (req, res) => {
  res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  const existing = await Admin.findOne({ username });
  if (existing) {
    return res.render("signup", { error: "Username already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await Admin.create({
    username,
    passwordHash
  });

  res.redirect("/login");
});

// ----- AUTH -----
app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });
  if (!admin) return res.render("login", { error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.render("login", { error: "Invalid credentials" });

  req.session.adminId = admin._id;
  res.redirect("/dashboard");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ----- DASHBOARD -----
app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/dashboard", requireAdmin, async (req, res) => {
  const totalStudents = await Student.countDocuments();
  const unpaidFees = await Student.countDocuments({ feeStatus: "unpaid" });
  const totalNotices = await Notice.countDocuments();

  res.render("dashboard", { totalStudents, unpaidFees, totalNotices });
});

// ----- STUDENTS -----
app.get("/students", requireAdmin, async (req, res) => {
  const students = await Student.find().sort({ createdAt: -1 });
  res.render("students", { students });
});

app.get("/students/new", requireAdmin, (req, res) => {
  res.render("studentForm", { student: null });
});

app.post("/students", requireAdmin, async (req, res) => {
  await Student.create(req.body);
  res.redirect("/students");
});

app.get("/students/:id/edit", requireAdmin, async (req, res) => {
  const student = await Student.findById(req.params.id);
  res.render("studentForm", { student });
});

app.post("/students/:id", requireAdmin, async (req, res) => {
  await Student.findByIdAndUpdate(req.params.id, req.body);
  res.redirect("/students");
});

app.post("/students/:id/delete", requireAdmin, async (req, res) => {
  await Student.findByIdAndDelete(req.params.id);
  res.redirect("/students");
});

// ----- ATTENDANCE -----
app.get("/attendance", requireAdmin, async (req, res) => {
  const students = await Student.find().sort({ name: 1 });

  const selectedDate = req.query.date || "";
  const filter = selectedDate ? { date: selectedDate } : {};

  const records = await Attendance.find(filter)
    .populate("student")
    .sort({ createdAt: -1 });

  res.render("attendance", { students, records, msg: null, selectedDate });
});

app.post("/attendance", requireAdmin, async (req, res) => {
  const { studentId, date, status } = req.body;

  await Attendance.findOneAndUpdate(
    { student: studentId, date },
    { student: studentId, date, status },
    { upsert: true, new: true }
  );

  // show table for same date after saving
  res.redirect(`/attendance?date=${date}`);
});

// ----- NOTICES -----
app.get("/notices", requireAdmin, async (req, res) => {
  const notices = await Notice.find().sort({ createdAt: -1 });
  res.render("notices", { notices });
});

app.post("/notices", requireAdmin, async (req, res) => {
  await Notice.create(req.body);
  res.redirect("/notices");
});

// test route
app.get("/test", (req, res) => {
  res.send("ERP is working ✅");
});

// start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("ERP running on port", PORT));