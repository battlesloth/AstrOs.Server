import {
  Component,
  ElementRef,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TransmissionType } from 'astros-common';
import { AuthenticationService } from './services/auth/authentication.service';
import { SnackbarService } from './services/snackbar/snackbar.service';
import { WebsocketService } from './services/websocket/websocket.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [RouterLink, NgIf, RouterOutlet],
})
export class AppComponent implements OnInit {
  title = 'AstOs';
  private menuOpen = false;

  @ViewChild('sideNav', { static: false }) sideNav!: ElementRef;
  @ViewChild('clickDetector', { static: false }) clickDetector!: ElementRef;

  constructor(
    public auth: AuthenticationService,
    private renderer: Renderer2,
    private router: Router,
    private snackbar: SnackbarService,
    private socket: WebsocketService,
  ) {
    if (auth.isLoggedIn()) {
      //router.navigate(['status']);
      router.navigate(['modules']);
    }
  }

  ngOnInit(): void {
    this.socket.messages.subscribe((msg: unknown) => {
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
    this.menuOpen = false;
  }

  containerKeyPressed(event: KeyboardEvent) {
    if (
      event.key === 'Escape' ||
      event.key === 'Esc' ||
      event.key === 'Enter' ||
      event.key === 'Space'
    ) {
      this.closeMenu();
    }
  }

  containerClicked() {
    if (this.menuOpen) {
      this.closeMenu();
    }
  }

  private handleSocketMessage(msg: unknown) {
    if (msg && typeof msg === 'object' && 'type' in msg && 'message' in msg) {
      switch (msg.type) {
        case TransmissionType.sync:
          this.snackbar.okToast(msg.message as string);
          break;
      }
    }
  }
}
