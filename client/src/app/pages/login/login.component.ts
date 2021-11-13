import { Component, OnInit } from '@angular/core';
import { AuthenticationService, TokenPayload } from '../../services/auth/authentication.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  credentials: TokenPayload = {
    username: "",
    password: ""
  }

  constructor(private auth: AuthenticationService, private router: Router) { }

  ngOnInit(): void {
  }

  login(){
    this.auth.login(this.credentials).subscribe(
      () => {
        this.router.navigateByUrl("/status")
      },
      err =>{
        console.error(err);
      }
    );
  }
}