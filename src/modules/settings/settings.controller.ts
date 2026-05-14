import { Response } from "express";
import { AuthRequest } from "../common/common.types";
import { asyncHandler } from "../common/common.utiles";
import { SystemSettings } from "../../models/SystemSettings";

export const getSystemSettings = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({});
    }
    res.json(settings);
  }
);

export const updateSystemSettings = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({});
    }
    
    // Update fields from request body
    const updates = req.body;
    if (updates.institutionName !== undefined) settings.institutionName = updates.institutionName;
    if (updates.contactEmail !== undefined) settings.contactEmail = updates.contactEmail;
    if (updates.qrValidityMinutes !== undefined) settings.qrValidityMinutes = updates.qrValidityMinutes;
    
    if (updates.pointMultipliers && settings.pointMultipliers) {
      if (updates.pointMultipliers.streakBonus !== undefined) {
        settings.pointMultipliers.streakBonus = updates.pointMultipliers.streakBonus;
      }
      if (updates.pointMultipliers.earlySubmission !== undefined) {
        settings.pointMultipliers.earlySubmission = updates.pointMultipliers.earlySubmission;
      }
    }
    
    if (updates.academicCalendar && settings.academicCalendar) {
      if (updates.academicCalendar.semesterStart) {
        settings.academicCalendar.semesterStart = new Date(updates.academicCalendar.semesterStart);
      }
      if (updates.academicCalendar.semesterEnd) {
        settings.academicCalendar.semesterEnd = new Date(updates.academicCalendar.semesterEnd);
      }
    }
    
    await settings.save();
    res.json(settings);
  }
);
