import { Router } from 'express';
import { Routes } from '@interfaces/routes.interface';
import validationMiddleware from '@/middlewares/validation.middleware';
import DataController from '@/controllers/data.controller';

class DataRoute implements Routes {
  public path = '/data';
  public router = Router();
  public controller = new DataController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    /**
     * @api {get} /data/series get historic values of measurement
     * @apiName data series
     * @apiGroup data
     *
     * @apiUse authentication
     *
     * @apiSuccess {Array} list of devices paired to user account
     * @apiParam {String} device_id device uuid
     * @apiParam {String} measure measurement
     *
     * @apiQuery {String} from start of measurement as fluxql time format (eg '-1d')
     * @apiQuery {String} to end of measurement as fluxql time format (eg 'now()')
     * @apiQuery {String} interval interval between measurements (eg '10s')
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     [
     *       {
     *         "_time":"2025-06-16T09:19:40Z",
     *         "_value":27.05348,
     *       },
     *       {
     *         "_time":"2025-06-16T09:20:00Z",
     *         "_value":27.032787499999998,
     *       },
     *       ...
     *     ]
     *
     */
    this.router.get(`${this.path}/series/:device_id/:measure`, this.controller.getSeries);

    /**
     * @api {get} /data/latest get latest value of measurement
     * @apiName data latest
     * @apiGroup data
     *
     * @apiUse authentication
     *
     * @apiSuccess {Array} list of devices paired to user account
     * @apiParam {String} device_id device uuid
     * @apiParam {String} measure measurement
     *
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *         "value":27.05348,
     *     }
     */
    this.router.get(`${this.path}/latest/:device_id/:measure`, this.controller.getLatest);
  }
}

export default DataRoute;
