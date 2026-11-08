'use strict';

const express = require('express');

const { AppError, ERROR_CODES, notFound, validationError } = require('../errors');

function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw validationError([{ field: 'id', issue: 'must be a positive integer' }]);
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw validationError([{ field: 'id', issue: 'must be a positive integer' }]);
  }
  return id;
}

module.exports = function createCoursesRouter(repo) {
  const router = express.Router();

  /** GET /api/courses — catalogue with live seat counts */
  router.get('/', (req, res) => {
    res.json({ courses: repo.listCourses() });
  });

  /** POST /api/courses/:id/enrollments — enrol the current user */
  router.post('/:id/enrollments', (req, res, next) => {
    try {
      const courseId = parseId(req.params.id);
      const course = repo.findCourse(courseId);

      if (!course) throw notFound(`Course ${courseId} not found`);
      if (repo.findActiveEnrollment(courseId, req.user.id)) {
        throw new AppError(409, ERROR_CODES.ALREADY_ENROLLED, `You are already enrolled in ${course.code}`);
      }
      if (course.seatsAvailable < 1) {
        throw new AppError(409, ERROR_CODES.COURSE_FULL, `${course.code} has no seats left`);
      }

      const enrollmentId = repo.enroll(courseId, req.user.id);
      res.status(201).json({ enrollment: repo.findEnrollment(enrollmentId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
