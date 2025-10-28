import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
})
export class AccountPage implements OnInit {

  public new_password:string = "";
  public repeat_password:string = "";
  public working:boolean = false;

  public message:number = 0;

  constructor(
    private _authService: AuthService
  ) {
  }

  ngOnInit() {
  }

  async changePwd() {
    if(this.new_password == this.repeat_password) {
      this.working = true;
      try {
        await this._authService.changePassword(this.new_password)
        this.message = 4
      }
      catch(err) {
        this.message = 3
      }
      this.working = false;
    }
    else {
      this.message = 2;
    }
  }

  logout() {
    this._authService.logout();
  }

}
