import { Component, ElementRef, Renderer2, ViewChild, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { AuthenticationService } from './services/auth/authentication.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  title = "AstOs"

  @ViewChild('sideNav', { static: false }) sideNav!: ElementRef;

  constructor(public auth: AuthenticationService,
    private renderer: Renderer2, private router: Router) {
      if (auth.isLoggedIn()) {
        router.navigate(['scripter', 'e0116483-c0fa-3ce6-71c0-20a56241e947'])
        //router.navigate(['scripter', '5493096a-122a-a5ed-abce-9d0c801d61f0']);
        //router.navigate(['status']);
      }
     }

  logout() {
    this.auth.logout();
  }

  showMenu() {
    if (this.auth.isLoggedIn()) {
      this.renderer.setStyle(this.sideNav.nativeElement, 'width', '220px');
    }
  }

  closeMenu() {
    this.renderer.setStyle(this.sideNav.nativeElement, 'width', '0px');
  }
}
