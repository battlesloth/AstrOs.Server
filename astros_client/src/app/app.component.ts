import { Component, ElementRef, OnInit, Renderer2, ViewChild, ViewEncapsulation } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TransmissionType } from 'astros-common';
import { AuthenticationService } from './services/auth/authentication.service';
import { SnackbarService } from './services/snackbar/snackbar.service';
import { WebsocketService } from './services/websocket/websocket.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  title = "AstOs"

  @ViewChild('sideNav', { static: false }) sideNav!: ElementRef;

  constructor(public auth: AuthenticationService,
    private renderer: Renderer2,
    private router: Router,
    private snackbar: SnackbarService,
    private socket: WebsocketService) {
    if (auth.isLoggedIn()) {
      router.navigate(['status']);
      //router.navigate(['/scripter/s1673888226Cd4g3']);
    }
  }

  ngOnInit(): void {
    this.socket.messages.subscribe((msg: any) => {
        this.handleSocketMessage(msg);
    });
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

  private handleSocketMessage(msg: any){
    switch(msg.type){
      case TransmissionType.sync:
        this.snackbar.okToast(msg.message);       
        break; 
    }
  }
}
