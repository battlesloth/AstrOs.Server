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
  private menuOpen: boolean = false;

  @ViewChild('sideNav', { static: false }) sideNav!: ElementRef;
  @ViewChild('clickDetector', { static: false }) clickDetector!: ElementRef;

  constructor(public auth: AuthenticationService,
    private renderer: Renderer2,
    private router: Router,
    private snackbar: SnackbarService,
    private socket: WebsocketService) {
    if (auth.isLoggedIn()) {
      router.navigate(['modules']);
      //router.navigate(['status']);
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
      this.renderer.setStyle(this.clickDetector.nativeElement, 'width', '100%');
      this.menuOpen = true;
    }
  }

  closeMenu() {
    this.renderer.setStyle(this.sideNav.nativeElement, 'width', '0px');
    this.renderer.setStyle(this.clickDetector.nativeElement, 'width', '0px');
    this.menuOpen = false
  }

  containerClicked() {
    if (this.menuOpen) {
      this.closeMenu();
    }
  }

  private handleSocketMessage(msg: any) {
    switch (msg.type) {
      case TransmissionType.sync:
        this.snackbar.okToast(msg.message);
        break;
    }
  }
}
