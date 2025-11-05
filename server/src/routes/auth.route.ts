import { Router } from 'express';
import AuthController from '@controllers/auth.controller';
import { LoginDto, SignupDto, ActivationDto, PasswordResetDto } from '@dtos/users.dto';
import { Routes } from '@interfaces/routes.interface';
import { authMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';

class AuthRoute implements Routes {
  public path = '/';
  public router = Router();
  public authController = new AuthController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    /**
     * @apiDefine authentication
     *
     * @apiHeader {String} Authorization userToken
     *
     */

    /**
     * @api {post} /signup Sign up new User
     * @apiName signup
     * @apiGroup auth
     *
     * @apiBody {String} username valid email address used as username
     * @apiBody {String} password password for the new user
     *
     * @apiSuccess {String} message "created"
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 201 CREATED
     *     {
     *       "message": "created"
     *     }
     *
     */
    this.router.post(`${this.path}signup`, validationMiddleware(SignupDto, 'body'), this.authController.signUp);

    /**
     * @api {post} /activate Activate user
     * @apiName activate
     * @apiGroup auth
     *
     * @apiBody {String} activation_code activation code sent to registered email address
     *
     * @apiSuccess {String} message "activated"
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 201 CREATED
     *     {
     *       "message": "activated"
     *     }
     *
     */
    this.router.post(`${this.path}activate`, validationMiddleware(ActivationDto, 'body'), this.authController.activate);

    /**
     * @api {post} /login Login user
     * @apiName login
     * @apiGroup auth
     *
     * @apiBody {String} username email address of the user
     * @apiBody {String} password password of the user
     *
     * @apiSuccess {Object} user login information
     * @apiSuccess {String} user.username username of the current user
     * @apiSuccess {String} user.user_id id of the current user
     * @apiSuccess {Boolean} user.is_admin user has admnin permissions
     * @apiSuccess {String} userToken login token used to authenticate further api calls
     * @apiSuccess {String} refreshToken refreshToken used to refresh userToken
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "user": {
     *          "username": "myuser",
     *          "user_id": "12345",
     *          "is_admin": false
     *       },
     *       userToken: "12345",
     *       refreshToken: "12345"
     *     }
     *
     */
    this.router.post(`${this.path}login`, validationMiddleware(LoginDto, 'body'), this.authController.logIn);
    this.router.post(`${this.path}tokenlogin`, this.authController.loginWithToken);

    /**
     * @api {post} /refresh refresh userTiken
     * @apiName refresh
     * @apiGroup auth
     *
     * @apiBody {String} token valid refreshToken
     *
     * @apiSuccess {String} userToken login token used to authenticate further api calls
     * @apiSuccess {String} refreshToken refreshToken used to refresh userToken
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       userToken: "12345",
     *       refreshToken: "12345"
     *     }
     *
     */
    this.router.post(`${this.path}refresh`, this.authController.refresh);

    /**
     * @api {post} /getreset request password reset link/token
     * @apiName getreset
     * @apiGroup auth
     *
     * @apiBody {String} username email address of the user
     * @apiBody {String} password empty string
     *
     * @apiSuccess {String} message "sent"
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 201 CREATED
     *     {
     *       "message": "sent"
     *     }
     *
     */
    this.router.post(`${this.path}getreset`, validationMiddleware(LoginDto, 'body'), this.authController.getPasswordToken);

    /**
     * @api {post} /reset reset password
     * @apiName reset
     * @apiGroup auth
     *
     * @apiBody {String} token password reset token
     * @apiBody {String} password new password
     *
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *     }
     *
     */
    this.router.post(`${this.path}reset`, validationMiddleware(PasswordResetDto, 'body'), this.authController.resetPassword);

    this.router.post(`${this.path}logout`, authMiddleware, this.authController.logOut);

    /**
     * @api {post} /changepass change password
     * @apiName changepass
     * @apiGroup auth
     *
     * @apiUse authentication
     *
     * @apiBody {String} username email address of the user
     * @apiBody {String} password new password
     *
     *
     * @apiSuccessExample Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *     }
     *
     */
    this.router.post(`${this.path}changepass`, authMiddleware, validationMiddleware(LoginDto), this.authController.changePassword);
  }
}

export default AuthRoute;
