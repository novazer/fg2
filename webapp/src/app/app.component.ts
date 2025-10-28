import { Component } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';


@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  private publicPages = [
    { title: 'menu.devices', url: '/list', icon: 'mail' },
    { title: 'menu.account', url: '/account', icon: 'mail' },
  ];
  private adminPages = [
    { title: 'menu.diagnostics', url: '/diagnostics', icon: 'mail' },
    { title: 'menu.fleet', url: '/classes', icon: 'mail' },
  ];
  public appPages:any = [];
  public authenticated = false;

  constructor(
    public auth: AuthService,
    private _router: Router,
    private _route: ActivatedRoute,
    private translate: TranslateService
  ) {
    auth.authenticated.subscribe((authenticated) => {
      this.authenticated = authenticated;
      if(!authenticated) {
        console.log(this._route.snapshot)
        //this._router.navigateByUrl('/login', {})
      }
      else {
        // this._router.navigateByUrl('/list')
      }
    })

    auth.current_user.subscribe((user) => {
      if(user?.is_admin) {
        this.appPages = []
        this.appPages.push(...this.publicPages)
        this.appPages.push(...this.adminPages)
      }
      else {
        this.appPages = []
        this.appPages.push(...this.publicPages)
      }
    })

    this.initTranslate();
  }

  private initTranslate() {
    this.translate.setDefaultLang('en');
    let lang = this.translate.getBrowserLang();
    if (lang !== undefined) {
      console.log(lang)
      this.translate.use(lang);
    }
    else {
      this.translate.use('en');
    }
  }
}
