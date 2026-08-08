import * as recommendationService from './recommendation.service.js';

export async function getRecommendationsHandler(req, res, next) {
  try {
    const { serviceId } = req.params;

    const recommendations =
      await recommendationService.getRecommendationsForService(serviceId);

    res.status(200).json({
      data: recommendations,
    });
  } catch (error) {
    next(error);
  }
}
