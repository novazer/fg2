import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { filter, Subject, take, takeUntil } from 'rxjs';
import { ModalController } from '@ionic/angular';
import { DsgvoModalPage } from './dsgvo/dsgvo.page';


@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  public loginValid = false;
  public username = '';
  public password = '';
  public repeat = '';
  public mode = 0;
  public message = 0;
  public activation_code = ''
  public recovery_code = ''
  public working:boolean = false;
  public dsvgo_agreed:boolean = false;

  private _destroySub$ = new Subject<void>();
  private readonly returnUrl: string;

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private _authService: AuthService,
    public modalController: ModalController
  ) {
    this.returnUrl = this._route.snapshot.queryParams['returnUrl'] || '/list';
    this.activation_code = this._route.snapshot.queryParams['code'];
    this.recovery_code = this._route.snapshot.queryParams['recovery'];

  }

  public ngOnInit(): void {
    if(this._authService.authenticated.value) {
      this._router.navigateByUrl(this.returnUrl)
    }

    if(this.activation_code) {
      this.activate()
    }
    else if(this.recovery_code) {
      this.mode = 3
    }
  }

  async presentModal() {
    const modal = await this.modalController.create({
      component: DsgvoModalPage,
      cssClass: 'my-custom-class',
    });
    return await modal.present();
  }

  public ngOnDestroy(): void {
    this._destroySub$.next();
  }

  public async activate() {
    this.working = true;
    this.mode = 2
    try {
      let res = await this._authService.activate(this.activation_code)
      this.message = 7;
    }
    catch(err:any) {
      console.log(err)

      if(err.error.message == 'Wrong activation code') {
        this.message = 5;
      }
      else {
        this.message = 3;
      }
    }
    this.username = ""
    this.password = ""
    this.working = false;
  }

  public async login() {
    this.working = true;
    try {
      await this._authService.login(this.username, this.password)
      console.log("auth")
      // this.loginValid = true;
      this._router.navigateByUrl('/list');
    }
    catch(err:any) {
      console.log(err)

      if(err.error.message == 'Wrong email/password') {
        this.message = 1;
      }
      else if(err.error.message == 'User not activated') {
        this.message = 2;
      }
      else {
        this.message = 3;
      }
      this.loginValid = false
    }
    this.username = ""
    this.password = ""
    this.working = false;
  }

  public async register() {
    this.working = true;
    if(this.password != this.repeat) {
      this.message = 4;
      return;
    }

    try {
      await this._authService.register(this.username, this.password)
      this.message = 6;
    }
    catch(err:any) {
      console.log(err)
      if(err.error.message == 'User allready exists') {
        this.message = 8;
      }
      else {
        this.message = 3;
      }
    }
    this.username = ""
    this.password = ""
    this.repeat = ""
    this.working = false;
  }

  public async sendRecovery() {
    this.working = true;
    try {
      await this._authService.getPwToken(this.username);
      this.message = 9;
    }
    catch(err) {
      this.message = 3;
    }
    this.working = false;
  }

  public async recover() {
    if(this.password != this.repeat) {
      this.message = 4;
      return;
    }
    this.working = true;
    try {
      await this._authService.recoverPassword(this.password, this.recovery_code)
      this.mode = 4
      this.message = 0
    }
    catch(err:any) {
      console.log(err)
      if(err.error.message == 'Wrong token') {
        this.message = 10;
      }
      else {
        this.message = 3;
      }
    }
    this.username = ""
    this.password = ""
    this.repeat = ""
    this.working = false;
  }
}
