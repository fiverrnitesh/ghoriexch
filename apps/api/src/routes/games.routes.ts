import { Router } from 'express';
import { gameService } from '../modules/games/game.service.js';
import { optionalAuth } from '../middleware/auth.js';
import { successResponse } from '../lib/response.js';
import { paramString } from '../lib/utils.js';

const router = Router();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const category = req.query.category as string | undefined;
    const games = await gameService.listCatalog({ category });
    res.json(successResponse(games));
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const game = await gameService.getBySlug(paramString(req.params.slug));
    const config = await gameService.getConfiguration(game.id);
    res.json(successResponse({ ...game, configuration: config }));
  } catch (err) {
    next(err);
  }
});

export default router;
