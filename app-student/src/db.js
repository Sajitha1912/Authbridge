'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');

/**
 * student.db is owned exclusively by app-student and holds ONLY domain data.
 * There are exactly two tables, and neither of them stores credentials:
 * users live in auth-service's users.db and are referenced by id only.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  instructor  TEXT    NOT NULL,
  credits     INTEGER NOT NULL DEFAULT 3 CHECK (credits > 0),
  seats_total INTEGER NOT NULL DEFAULT 30 CHECK (seats_total >= 0),
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id   INTEGER NOT NULL REFERENCES courses (id),
  user_id     INTEGER NOT NULL,             -- logical reference to auth-service users.id
  enrolled_at TEXT    NOT NULL,
  dropped_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_active ON enrollments (user_id, dropped_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_active ON enrollments (course_id, dropped_at);
`;

const DEMO_COURSES = [
  { code: 'CS101', title: 'Introduction to Programming', instructor: 'Dr. A. Fernando', credits: 4, seatsTotal: 30 },
  { code: 'CS204', title: 'Data Structures', instructor: 'Prof. M. Iqbal', credits: 4, seatsTotal: 25 },
  { code: 'CS310', title: 'Distributed Systems', instructor: 'Dr. L. Nakamura', credits: 3, seatsTotal: 18 },
  { code: 'CS330', title: 'Service-Oriented Architecture', instructor: 'Prof. R. Delgado', credits: 3, seatsTotal: 12 },
  { code: 'MA201', title: 'Linear Algebra', instructor: 'Dr. S. Petrov', credits: 3, seatsTotal: 40 },
  { code: 'CS395', title: 'Capstone Project', instructor: 'Staff', credits: 6, seatsTotal: 1 },
];

function createDb(dbPath = config.dbPath) {
  const inMemory = dbPath === ':memory:';

  if (!inMemory) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  if (!inMemory) db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);

  return db;
}

function seedDemoCourses(db) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM courses').get();
  if (total > 0) return 0;

  const insert = db.prepare(`
    INSERT INTO courses (code, title, instructor, credits, seats_total, created_at)
    VALUES (@code, @title, @instructor, @credits, @seats_total, @created_at)
  `);
  const now = new Date().toISOString();

  for (const course of DEMO_COURSES) {
    insert.run({
      code: course.code,
      title: course.title,
      instructor: course.instructor,
      credits: course.credits,
      seats_total: course.seatsTotal,
      created_at: now,
    });
  }

  return DEMO_COURSES.length;
}

/** Maps a courses row (plus computed seats) to the API shape. */
function toPublicCourse(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    instructor: row.instructor,
    credits: row.credits,
    seatsTotal: row.seats_total,
    seatsAvailable: Number(row.seats_available),
  };
}

/** Maps an enrollments row (joined with its course) to the API shape. */
function toPublicEnrollment(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    courseCode: row.course_code,
    courseTitle: row.course_title,
    credits: row.credits,
    userId: row.user_id,
    enrolledAt: row.enrolled_at,
    droppedAt: row.dropped_at,
  };
}

const COURSES_WITH_SEATS = `
  SELECT c.*,
         (c.seats_total - COALESCE((
           SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.dropped_at IS NULL
         ), 0)) AS seats_available
  FROM courses c
`;

const ENROLLMENTS_WITH_COURSE = `
  SELECT e.*, c.code AS course_code, c.title AS course_title, c.credits AS credits
  FROM enrollments e
  JOIN courses c ON c.id = e.course_id
`;

function createCourseRepository(db) {
  const listCoursesStmt = db.prepare(`${COURSES_WITH_SEATS} ORDER BY c.code`);
  const courseByIdStmt = db.prepare(`${COURSES_WITH_SEATS} WHERE c.id = ?`);
  const insertEnrollmentStmt = db.prepare(`
    INSERT INTO enrollments (course_id, user_id, enrolled_at)
    VALUES (@course_id, @user_id, @enrolled_at)
  `);
  const dropEnrollmentStmt = db.prepare(`
    UPDATE enrollments SET dropped_at = @dropped_at
    WHERE id = @id AND user_id = @user_id AND dropped_at IS NULL
  `);
  const enrollmentsByUserStmt = db.prepare(`${ENROLLMENTS_WITH_COURSE} WHERE e.user_id = ? ORDER BY e.id DESC`);
  const enrollmentByIdStmt = db.prepare(`${ENROLLMENTS_WITH_COURSE} WHERE e.id = ?`);
  const activeEnrollmentStmt = db.prepare(
    'SELECT * FROM enrollments WHERE course_id = ? AND user_id = ? AND dropped_at IS NULL',
  );

  return {
    listCourses: () => listCoursesStmt.all().map(toPublicCourse),
    findCourse: (id) => {
      const row = courseByIdStmt.get(id);
      return row ? toPublicCourse(row) : null;
    },
    listEnrollmentsForUser: (userId) => enrollmentsByUserStmt.all(userId).map(toPublicEnrollment),
    findActiveEnrollment: (courseId, userId) => {
      const row = activeEnrollmentStmt.get(courseId, userId);
      return row ? toPublicEnrollment(row) : null;
    },
    enroll: (courseId, userId) => {
      const info = insertEnrollmentStmt.run({
        course_id: courseId,
        user_id: userId,
        enrolled_at: new Date().toISOString(),
      });
      return Number(info.lastInsertRowid);
    },
    findEnrollment: (enrollmentId) => {
      const row = enrollmentByIdStmt.get(enrollmentId);
      return row ? toPublicEnrollment(row) : null;
    },
    drop: (enrollmentId, userId) => {
      const info = dropEnrollmentStmt.run({
        id: enrollmentId,
        user_id: userId,
        dropped_at: new Date().toISOString(),
      });
      return Number(info.changes) > 0;
    },
  };
}

module.exports = { createDb, createCourseRepository, seedDemoCourses, toPublicCourse, toPublicEnrollment };
